import { randomUUID } from "crypto";
import { ObjectId, type Db } from "mongodb";
import { getDb } from "./connection";
import { ensureDefaults, type MongoUser } from "./auth";

type Action = "select" | "insert" | "update" | "delete";
type FilterOp = "eq" | "gte" | "lte" | "gt" | "in" | "not";

export interface QueryFilter {
  column: string;
  modifier?: string;
  op: FilterOp;
  value: unknown;
}

export interface QueryOrder {
  ascending?: boolean;
  column: string;
  nullsFirst?: boolean;
}

export interface QueryRequest {
  action: Action;
  columns?: string;
  count?: "exact";
  filters: QueryFilter[];
  limit?: number;
  orders: QueryOrder[];
  orFilters: string[];
  range?: { from: number; to: number };
  single?: boolean;
  table: string;
  values?: unknown;
}

export interface QueryResult<T = unknown> {
  count?: number | null;
  data: T | T[] | null;
  error: { message: string } | null;
}

type DocumentRow = Record<string, any>;

const COLLECTIONS = new Set([
  "allowed_emails",
  "batches",
  "business_settings",
  "categories",
  "customers",
  "locations",
  "products",
  "profiles",
  "purchase_order_items",
  "purchase_orders",
  "sale_items",
  "sale_return_items",
  "sale_returns",
  "sales",
  "stock_movements",
  "suppliers",
]);

const ID_COLLECTIONS = [
  "batches",
  "categories",
  "customers",
  "locations",
  "products",
  "profiles",
  "purchase_order_items",
  "purchase_orders",
  "sale_items",
  "sale_return_items",
  "sale_returns",
  "sales",
  "stock_movements",
  "suppliers",
];

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function cloneRow<T>(row: T): T {
  return JSON.parse(JSON.stringify(row)) as T;
}

function publicRow(row: DocumentRow) {
  const copy = { ...row };
  if ((copy.id === null || copy.id === undefined || copy.id === "") && copy._id) {
    copy.id = String(copy._id);
  }
  delete copy._id;
  delete copy.password_hash;
  return copy;
}

function rowPublicId(row: DocumentRow) {
  const value = row.id ?? row.product_id ?? row._id;
  return value === null || value === undefined ? "" : String(value);
}

function repairedDocumentId(collection: string, row: DocumentRow) {
  if (collection === "products" && row.product_id) return String(row.product_id);
  return String(row._id);
}

function objectIdFromString(value: string) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function idFilter(ids: string[]) {
  const clean = ids.map(String).map((id) => id.trim()).filter(Boolean);
  const objectIds = clean
    .map(objectIdFromString)
    .filter((id): id is ObjectId => id !== null);
  const clauses: DocumentRow[] = [{ id: { $in: clean } }];
  if (objectIds.length > 0) clauses.push({ _id: { $in: objectIds } });
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

function singleIdFilter(id: string) {
  return idFilter([id]);
}

function foreignIdFilter(field: string, id: string) {
  const objectId = objectIdFromString(id);
  if (!objectId) return { [field]: id };
  return { $or: [{ [field]: id }, { [field]: objectId }] };
}

function signedMovement(row: DocumentRow) {
  if (row.type === "in") return toNumber(row.quantity);
  if (row.type === "out") return -toNumber(row.quantity);
  return toNumber(row.quantity);
}

function publicStock(value: unknown) {
  return Math.max(0, toNumber(value));
}

function error(message: string): QueryResult {
  return { data: null, error: { message } };
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("profiles").createIndex({ email: 1 }, { unique: true }),
    db.collection("categories").createIndex({ name: 1 }, { unique: true }),
    db.collection("products").createIndex(
      { sku: 1 },
      { sparse: true, unique: true }
    ),
    db.collection("products").createIndex(
      { barcode: 1 },
      { sparse: true, unique: true }
    ),
    db.collection("customers").createIndex({ name: 1 }),
    db.collection("locations").createIndex({ name: 1 }, { unique: true }),
    db.collection("suppliers").createIndex({ name: 1 }),
    db.collection("batches").createIndex(
      { product_id: 1, batch_no: 1 },
      { unique: true }
    ),
    db.collection("sales").createIndex({ invoice_no: 1 }, { unique: true }),
    db.collection("purchase_orders").createIndex(
      { po_no: 1 },
      { unique: true }
    ),
    db.collection("sale_returns").createIndex(
      { return_no: 1 },
      { unique: true }
    ),
    db.collection("stock_movements").createIndex(
      { repair_key: 1 },
      { sparse: true, unique: true }
    ),
  ]);
}

async function ensureDocumentIds(db: Db) {
  await Promise.all(
    ID_COLLECTIONS.map(async (name) => {
      const rows = await db
        .collection(name)
        .find(
          {
            $or: [
              { id: { $exists: false } },
              { id: null },
              { id: "" },
            ],
          },
          { projection: { _id: 1, product_id: 1 } }
        )
        .toArray();
      if (rows.length === 0) return;
      await Promise.all(
        rows.map((row) =>
          db.collection(name).updateOne(
            { _id: row._id },
            { $set: { id: repairedDocumentId(name, row) } }
          )
        )
      );
    })
  );
}

async function normalizeProducts(db: Db) {
  await Promise.all([
    db
      .collection("products")
      .updateMany({ $or: [{ sku: null }, { sku: "" }] }, { $unset: { sku: "" } }),
    db
      .collection("products")
      .updateMany(
        { $or: [{ barcode: null }, { barcode: "" }] },
        { $unset: { barcode: "" } }
      ),
    db.collection("products").updateMany(
      {
        $or: [
          { unit: { $exists: false } },
          { unit: null },
          { unit: "" },
          { unit: { $regex: /^-?\d+(\.\d+)?$/ } },
        ],
      },
      { $set: { unit: "pcs" } }
    ),
  ]);
}

async function normalizeStockMovements(db: Db) {
  const defaultLocationId = await getDefaultLocationId(db);
  await db.collection("stock_movements").updateMany(
    {
      $or: [
        { location_id: { $exists: false } },
        { location_id: null },
        { location_id: "" },
      ],
    },
    { $set: { location_id: defaultLocationId } }
  );
}

async function repairNegativeStock(db: Db) {
  const [products, movements] = await Promise.all([
    db.collection("products").find({}).toArray(),
    db.collection("stock_movements").find({}).toArray(),
  ]);
  const productIds = new Set(products.map((product) => rowPublicId(product)));
  const byLocation = new Map<string, DocumentRow>();
  const byBatch = new Map<string, DocumentRow>();

  for (const movement of movements) {
    const productId = String(movement.product_id ?? "");
    const locationId = String(movement.location_id ?? "");
    if (!productId || !locationId || !productIds.has(productId)) continue;

    const locationKey = `${productId}\u0000${locationId}`;
    const locationRow =
      byLocation.get(locationKey) ??
      {
        location_id: locationId,
        product_id: productId,
        stock: 0,
      };
    locationRow.stock += signedMovement(movement);
    byLocation.set(locationKey, locationRow);

    if (movement.batch_id) {
      const batchId = String(movement.batch_id);
      const batchKey = `${productId}\u0000${locationId}\u0000${batchId}`;
      const batchRow =
        byBatch.get(batchKey) ??
        {
          batch_id: batchId,
          location_id: locationId,
          product_id: productId,
          stock: 0,
        };
      batchRow.stock += signedMovement(movement);
      byBatch.set(batchKey, batchRow);
    }
  }

  const created_at = nowIso();
  const corrections: DocumentRow[] = [];

  for (const row of byBatch.values()) {
    const stock = toNumber(row.stock);
    if (stock >= 0) continue;
    corrections.push({
      batch_id: row.batch_id,
      created_at,
      created_by: null,
      id: randomUUID(),
      location_id: row.location_id,
      product_id: row.product_id,
      quantity: Math.abs(stock),
      repair_key: `negative-stock-v1:${row.product_id}:${row.location_id}:${row.batch_id}:${Math.abs(stock)}`,
      reason: "System correction: negative stock reset to 0",
      supplier_id: null,
      type: "adjustment",
    });
  }

  for (const row of byLocation.values()) {
    const stock = toNumber(row.stock);
    if (stock >= 0) continue;
    const batchFix = corrections
      .filter(
        (correction) =>
          correction.product_id === row.product_id &&
          correction.location_id === row.location_id
      )
      .reduce((sum, correction) => sum + toNumber(correction.quantity), 0);
    const remaining = Math.abs(stock) - batchFix;
    if (remaining <= 0) continue;
    corrections.push({
      batch_id: null,
      created_at,
      created_by: null,
      id: randomUUID(),
      location_id: row.location_id,
      product_id: row.product_id,
      quantity: remaining,
      repair_key: `negative-stock-v1:${row.product_id}:${row.location_id}:none:${remaining}`,
      reason: "System correction: negative stock reset to 0",
      supplier_id: null,
      type: "adjustment",
    });
  }

  if (corrections.length > 0) {
    await db.collection("stock_movements").bulkWrite(
      corrections.map((correction) => ({
        updateOne: {
          filter: { repair_key: correction.repair_key },
          update: { $setOnInsert: correction },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }
}

export async function prepareDatabase(db?: Db) {
  const database = db ?? (await getDb());
  await ensureDefaults(database);
  await ensureDocumentIds(database);
  await normalizeProducts(database);
  await normalizeStockMovements(database);
  await ensureIndexes(database);
  await repairNegativeStock(database);
  return database;
}

async function getDefaultLocationId(db: Db) {
  const location =
    (await db.collection("locations").findOne({ is_default: true })) ??
    (await db.collection("locations").findOne({}));
  if (!location) throw new Error("Koi location nathi - Settings ma location banavo");
  return String(location.id);
}

async function nextNumber(db: Db, key: string) {
  const result = await db.collection("counters").findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { returnDocument: "after", upsert: true }
  );
  return result?.value ?? 1;
}

async function nextCode(db: Db, key: string, prefix: string) {
  const number = await nextNumber(db, key);
  const yearMonth = new Date().toISOString().slice(2, 7).replace("-", "");
  return `${prefix}-${yearMonth}-${String(number).padStart(4, "0")}`;
}

async function currentStockRows(db: Db): Promise<DocumentRow[]> {
  const [products, movements] = await Promise.all([
    db.collection("products").find({}).toArray(),
    db.collection("stock_movements").find({}).toArray(),
  ]);
  const stockByProduct = new Map<string, number>();
  for (const movement of movements) {
    const key = String(movement.product_id);
    stockByProduct.set(key, (stockByProduct.get(key) ?? 0) + signedMovement(movement));
  }
  return products.map((product) => {
    const productId = rowPublicId(product);
    const stock = publicStock(stockByProduct.get(productId) ?? 0);
    return publicRow({
      ...product,
      product_id: productId,
      stock,
      stock_value: round2(stock * toNumber(product.purchase_price)),
    });
  });
}

async function locationStockRows(db: Db): Promise<DocumentRow[]> {
  const [movements, products, locations] = await Promise.all([
    db.collection("stock_movements").find({}).toArray(),
    db.collection("products").find({}).toArray(),
    db.collection("locations").find({}).toArray(),
  ]);
  const productMap = new Map(products.map((p) => [rowPublicId(p), p]));
  const locationMap = new Map(locations.map((l) => [String(l.id), l]));
  const totals = new Map<string, DocumentRow>();
  for (const movement of movements) {
    const product = productMap.get(String(movement.product_id));
    const location = locationMap.get(String(movement.location_id));
    if (!product || !location) continue;
    const key = `${movement.product_id}:${movement.location_id}`;
    const row =
      totals.get(key) ??
      {
        is_active: product.is_active ?? true,
        location_id: movement.location_id,
        location_name: location.name,
        name: product.name,
        product_id: movement.product_id,
        stock: 0,
        unit: product.unit,
      };
    row.stock += signedMovement(movement);
    totals.set(key, row);
  }
  return [...totals.values()].map((row) => ({
    ...row,
    stock: publicStock(row.stock),
  }));
}

async function batchStockRows(db: Db): Promise<DocumentRow[]> {
  const [movements, products, locations, batches] = await Promise.all([
    db.collection("stock_movements").find({ batch_id: { $ne: null } }).toArray(),
    db.collection("products").find({}).toArray(),
    db.collection("locations").find({}).toArray(),
    db.collection("batches").find({}).toArray(),
  ]);
  const productMap = new Map(products.map((p) => [rowPublicId(p), p]));
  const locationMap = new Map(locations.map((l) => [String(l.id), l]));
  const batchMap = new Map(batches.map((b) => [String(b.id), b]));
  const totals = new Map<string, DocumentRow>();
  for (const movement of movements) {
    const product = productMap.get(String(movement.product_id));
    const location = locationMap.get(String(movement.location_id));
    const batch = batchMap.get(String(movement.batch_id));
    if (!product || !location || !batch) continue;
    const key = `${movement.product_id}:${movement.location_id}:${movement.batch_id}`;
    const row =
      totals.get(key) ??
      {
        batch_id: batch.id,
        batch_no: batch.batch_no,
        expiry_date: batch.expiry_date ?? null,
        location_id: location.id,
        location_name: location.name,
        product_id: rowPublicId(product),
        product_name: product.name,
        stock: 0,
        unit: product.unit,
      };
    row.stock += signedMovement(movement);
    totals.set(key, row);
  }
  return [...totals.values()].map((row) => ({
    ...row,
    stock: publicStock(row.stock),
  }));
}

async function saleItemsDatedRows(db: Db): Promise<DocumentRow[]> {
  const [items, sales] = await Promise.all([
    db.collection("sale_items").find({}).toArray(),
    db.collection("sales").find({}).toArray(),
  ]);
  const saleMap = new Map(sales.map((s) => [String(s.id), s]));
  return items.map((item) => {
    const sale = saleMap.get(String(item.sale_id));
    return publicRow({
      ...item,
      sale_status: sale?.status ?? null,
      sold_at: sale?.created_at ?? null,
    });
  });
}

async function rowsForTable(db: Db, table: string): Promise<DocumentRow[]> {
  if (table === "current_stock") return currentStockRows(db);
  if (table === "low_stock") {
    const rows = await currentStockRows(db);
    return rows.filter(
      (row) => row.is_active === true && toNumber(row.stock) <= toNumber(row.min_stock_level)
    );
  }
  if (table === "location_stock") return locationStockRows(db);
  if (table === "batch_stock") return batchStockRows(db);
  if (table === "expiring_stock") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 60);
    const rows = await batchStockRows(db);
    return rows.filter(
      (row) =>
        toNumber(row.stock) > 0 &&
        row.expiry_date &&
        new Date(row.expiry_date) <= cutoff
    );
  }
  if (table === "sale_items_dated") return saleItemsDatedRows(db);
  if (!COLLECTIONS.has(table)) throw new Error(`Unknown table: ${table}`);
  const rows = await db.collection(table).find({}).toArray();
  return rows.map(publicRow);
}

function matchesFilter(row: DocumentRow, filter: QueryFilter) {
  const value = row[filter.column];
  if (filter.op === "eq") {
    if (filter.value === null) return value === null || value === undefined;
    if (value === null || value === undefined) return false;
    return String(value) === String(filter.value);
  }
  if (filter.op === "gte") return String(value ?? "") >= String(filter.value ?? "");
  if (filter.op === "lte") return String(value ?? "") <= String(filter.value ?? "");
  if (filter.op === "gt") return toNumber(value) > toNumber(filter.value);
  if (filter.op === "in") {
    return (
      Array.isArray(filter.value) &&
      filter.value.some((candidate) => String(candidate) === String(value))
    );
  }
  if (filter.op === "not" && filter.modifier === "is" && filter.value === null) {
    return value !== null && value !== undefined;
  }
  return true;
}

function matchesOr(row: DocumentRow, expression: string) {
  const parts = expression.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return true;
  return parts.some((part) => {
    const [column, operator, ...rawValue] = part.split(".");
    const value = rawValue.join(".");
    if (operator === "ilike") {
      const term = value.replace(/^%|%$/g, "").toLowerCase();
      return String(row[column] ?? "").toLowerCase().includes(term);
    }
    if (operator === "eq") return String(row[column] ?? "") === value;
    return false;
  });
}

function applyFilters(rows: DocumentRow[], query: QueryRequest) {
  return rows.filter(
    (row) =>
      query.filters.every((filter) => matchesFilter(row, filter)) &&
      query.orFilters.every((expression) => matchesOr(row, expression))
  );
}

function applyOrdering(rows: DocumentRow[], orders: QueryOrder[]) {
  return [...rows].sort((left, right) => {
    for (const order of orders) {
      const a = left[order.column];
      const b = right[order.column];
      const ascending = order.ascending !== false;
      if (a == null && b == null) continue;
      if (a == null) return order.nullsFirst === false ? 1 : -1;
      if (b == null) return order.nullsFirst === false ? -1 : 1;
      if (a < b) return ascending ? -1 : 1;
      if (a > b) return ascending ? 1 : -1;
    }
    return 0;
  });
}

function applyRange(rows: DocumentRow[], query: QueryRequest) {
  if (query.range) return rows.slice(query.range.from, query.range.to + 1);
  if (typeof query.limit === "number") return rows.slice(0, query.limit);
  return rows;
}

async function decorateRows(db: Db, table: string, columns: string | undefined, rows: DocumentRow[]) {
  if (!columns) return rows;
  const out = rows.map((row) => ({ ...row }));

  if (table === "sales" && columns.includes("customers(")) {
    const ids = [...new Set(out.map((row) => row.customer_id).filter(Boolean))];
    const customers = await db.collection("customers").find({ id: { $in: ids } }).toArray();
    const map = new Map(customers.map((row) => [String(row.id), publicRow(row)]));
    out.forEach((row) => {
      row.customers = row.customer_id ? (map.get(String(row.customer_id)) ?? null) : null;
    });
  }

  if (table === "purchase_orders" && columns.includes("suppliers(")) {
    const ids = [...new Set(out.map((row) => row.supplier_id).filter(Boolean))];
    const suppliers = await db.collection("suppliers").find({ id: { $in: ids } }).toArray();
    const map = new Map(suppliers.map((row) => [String(row.id), publicRow(row)]));
    out.forEach((row) => {
      row.suppliers = row.supplier_id ? (map.get(String(row.supplier_id)) ?? null) : null;
    });
  }

  if (table === "stock_movements") {
    const productIds = [...new Set(out.map((row) => row.product_id).filter(Boolean))];
    const profileIds = [...new Set(out.map((row) => row.created_by).filter(Boolean))];
    const locationIds = [...new Set(out.map((row) => row.location_id).filter(Boolean))];
    const batchIds = [...new Set(out.map((row) => row.batch_id).filter(Boolean))];
    const [products, profiles, locations, batches] = await Promise.all([
      db.collection("products").find(idFilter(productIds.map(String))).toArray(),
      db.collection("profiles").find({ id: { $in: profileIds } }).toArray(),
      db.collection("locations").find({ id: { $in: locationIds } }).toArray(),
      db.collection("batches").find({ id: { $in: batchIds } }).toArray(),
    ]);
    const productMap = new Map(products.map((row) => [rowPublicId(row), publicRow(row)]));
    const profileMap = new Map(profiles.map((row) => [String(row.id), publicRow(row)]));
    const locationMap = new Map(locations.map((row) => [String(row.id), publicRow(row)]));
    const batchMap = new Map(batches.map((row) => [String(row.id), publicRow(row)]));
    out.forEach((row) => {
      if (columns.includes("products(")) {
        row.products = row.product_id ? (productMap.get(String(row.product_id)) ?? null) : null;
      }
      if (columns.includes("profiles:created_by(")) {
        row.profiles = row.created_by ? (profileMap.get(String(row.created_by)) ?? null) : null;
      }
      if (columns.includes("locations(")) {
        row.locations = row.location_id ? (locationMap.get(String(row.location_id)) ?? null) : null;
      }
      if (columns.includes("batches(")) {
        row.batches = row.batch_id ? (batchMap.get(String(row.batch_id)) ?? null) : null;
      }
    });
  }

  return out;
}

function makeInsertRows(table: string, values: unknown, user: MongoUser | null) {
  const source = Array.isArray(values) ? values : [values];
  const created = nowIso();
  return source.map((value) => {
    const row = { ...(value as DocumentRow) };
    if (table === "allowed_emails" && row.email) {
      row.email = String(row.email).trim().toLowerCase();
    }
    if (!row.id && table !== "allowed_emails" && table !== "business_settings") {
      row.id = randomUUID();
    }
    if (!row.created_at) row.created_at = created;
    if (table === "products") {
      if (row.sku === null || row.sku === "") delete row.sku;
      if (row.barcode === null || row.barcode === "") delete row.barcode;
      row.is_active = row.is_active ?? true;
      row.created_by = row.created_by ?? user?.id ?? null;
      row.updated_at = row.updated_at ?? created;
    }
    if (table === "stock_movements") {
      row.created_by = row.created_by ?? user?.id;
      row.location_id = row.location_id ?? null;
    }
    return row;
  });
}

function stockKey(productId: string, locationId: string, batchId?: string | null) {
  return [productId, locationId, batchId ?? ""].join("\u0000");
}

async function validateStockMovementRows(db: Db, rows: DocumentRow[]) {
  const productIds = [
    ...new Set(
      rows
        .map((row) => String(row.product_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  const products =
    productIds.length > 0
      ? await db.collection("products").find(idFilter(productIds)).toArray()
      : [];
  const validProductIds = new Set(products.map((product) => rowPublicId(product)));
  const locationDeltas = new Map<string, number>();
  const batchDeltas = new Map<string, number>();

  for (const row of rows) {
    const productId = String(row.product_id ?? "").trim();
    const locationId = String(row.location_id ?? "").trim();
    const batchId = row.batch_id ? String(row.batch_id) : null;
    const type = String(row.type ?? "");
    const quantity = toNumber(row.quantity);

    if (!["in", "out", "adjustment"].includes(type)) {
      throw new Error(`Invalid movement type: ${type}`);
    }
    if (!productId || !validProductIds.has(productId)) {
      throw new Error("Product not found");
    }
    if (!locationId) throw new Error("Location not found");
    if (type !== "adjustment" && quantity <= 0) {
      throw new Error("Quantity 0 thi vadhare hovi joie");
    }
    if (type === "adjustment" && quantity === 0) {
      throw new Error("Adjustment 0 na hoi shake");
    }

    const locationKey = stockKey(productId, locationId);
    const pendingLocationDelta = locationDeltas.get(locationKey) ?? 0;
    const currentLocationStock =
      (type === "in" ? 0 : await getLocationStock(db, productId, locationId)) +
      pendingLocationDelta;

    if (type === "out" && currentLocationStock < quantity) {
      throw new Error(`Aa location par stock ochho che (available: ${currentLocationStock})`);
    }
    if (type === "adjustment" && currentLocationStock + quantity < 0) {
      throw new Error(`Adjustment thi stock negative thai jashe (current: ${currentLocationStock})`);
    }

    if (batchId && type !== "in") {
      const batchKey = stockKey(productId, locationId, batchId);
      const pendingBatchDelta = batchDeltas.get(batchKey) ?? 0;
      const currentBatchStock =
        (await getLocationStock(db, productId, locationId, batchId)) +
        pendingBatchDelta;
      if (type === "out" && currentBatchStock < quantity) {
        throw new Error(`Aa batch ma stock ochho che (available: ${currentBatchStock})`);
      }
      if (type === "adjustment" && currentBatchStock + quantity < 0) {
        throw new Error(`Adjustment thi batch stock negative thai jashe (current: ${currentBatchStock})`);
      }
    }

    const delta = type === "out" ? -quantity : quantity;
    locationDeltas.set(locationKey, pendingLocationDelta + delta);
    if (batchId) {
      const batchKey = stockKey(productId, locationId, batchId);
      batchDeltas.set(batchKey, (batchDeltas.get(batchKey) ?? 0) + delta);
    }

    row.product_id = productId;
    row.location_id = locationId;
    row.batch_id = batchId;
    row.type = type;
    row.quantity = quantity;
  }
}

async function insertRows(db: Db, query: QueryRequest, user: MongoUser | null) {
  const rows = makeInsertRows(query.table, query.values, user);
  if (query.table === "stock_movements") {
    const defaultLocationId = await getDefaultLocationId(db);
    rows.forEach((row) => {
      row.location_id = row.location_id || defaultLocationId;
    });
    await validateStockMovementRows(db, rows);
  }
  if (rows.length === 0) return [];
  await db.collection(query.table).insertMany(rows);
  return rows.map(publicRow);
}

async function updateRows(db: Db, query: QueryRequest) {
  const rows = applyFilters(await rowsForTable(db, query.table), query);
  const values = { ...(query.values as DocumentRow) };
  const unset: DocumentRow = {};
  if (query.table === "stock_movements") {
    const balanceFields = new Set([
      "batch_id",
      "location_id",
      "product_id",
      "quantity",
      "type",
    ]);
    const changesBalance = Object.keys(values).some((key) => balanceFields.has(key));
    if (changesBalance) {
      throw new Error("Stock quantity entry edit nathi thai shakti. Correction mate Set stock entry karo.");
    }
  }
  if (query.table === "products") {
    values.updated_at = values.updated_at ?? nowIso();
    if (values.sku === null || values.sku === "") {
      delete values.sku;
      unset.sku = "";
    }
    if (values.barcode === null || values.barcode === "") {
      delete values.barcode;
      unset.barcode = "";
    }
  }
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (ids.length === 0) return [];
  const update: DocumentRow = {};
  if (Object.keys(values).length > 0) update.$set = values;
  if (Object.keys(unset).length > 0) update.$unset = unset;
  if (Object.keys(update).length === 0) return rows.map(publicRow);
  await db.collection(query.table).updateMany(idFilter(ids.map(String)), update);
  return rows.map((row) =>
    publicRow({
      ...row,
      ...values,
      ...Object.fromEntries(Object.keys(unset).map((key) => [key, null])),
    })
  );
}

async function deleteRows(db: Db, query: QueryRequest) {
  const rows = applyFilters(await rowsForTable(db, query.table), query);
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (query.table === "stock_movements") {
    throw new Error("Stock entries delete nathi thai shakti. Correction mate Set stock entry karo.");
  }
  if (query.table === "categories") {
    await db.collection("products").updateMany({ category_id: { $in: ids } }, { $set: { category_id: null } });
  }
  if (query.table === "locations") {
    const used = await db.collection("stock_movements").findOne({ location_id: { $in: ids } });
    if (used) throw new Error("violates foreign key");
  }
  if (query.table === "allowed_emails") {
    const emails = rows.map((row) => row.email).filter(Boolean);
    await db.collection("allowed_emails").deleteMany({ email: { $in: emails } });
    return rows.map(publicRow);
  }
  if (ids.length > 0) await db.collection(query.table).deleteMany(idFilter(ids.map(String)));
  return rows.map(publicRow);
}

export async function executeMongoQuery<T = unknown>(
  query: QueryRequest,
  user: MongoUser | null
): Promise<QueryResult<T>> {
  try {
    const db = await prepareDatabase();
    let rows: DocumentRow[];

    if (query.action === "insert") {
      rows = await insertRows(db, query, user);
    } else if (query.action === "update") {
      rows = await updateRows(db, query);
    } else if (query.action === "delete") {
      rows = await deleteRows(db, query);
    } else {
      rows = await rowsForTable(db, query.table);
      rows = applyFilters(rows, query);
    }

    const count = query.count === "exact" ? rows.length : null;
    rows = applyOrdering(rows, query.orders);
    rows = applyRange(rows, query);
    rows = await decorateRows(db, query.table, query.columns, rows);

    if (query.single) {
      return { count, data: (rows[0] ?? null) as T, error: null };
    }
    return { count, data: cloneRow(rows) as T[], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database request failed";
    return error(
      message.includes("duplicate key")
        ? "duplicate key value violates unique constraint"
        : message
    ) as QueryResult<T>;
  }
}

async function getLocationStock(db: Db, productId: string, locationId: string, batchId?: string | null) {
  const filter: DocumentRow = {
    ...foreignIdFilter("product_id", productId),
    location_id: locationId,
  };
  if (batchId) filter.batch_id = batchId;
  const movements = await db.collection("stock_movements").find(filter).toArray();
  return movements.reduce((sum, movement) => sum + signedMovement(movement), 0);
}

async function resolveBatch(
  db: Db,
  productId: string,
  type: string,
  batchNo?: string | null,
  expiryDate?: string | null,
  batchId?: string | null
) {
  if (batchId) return batchId;
  if (!batchNo?.trim()) return null;
  const normalized = batchNo.trim();
  const existing = await db.collection("batches").findOne({
    batch_no: normalized,
    ...foreignIdFilter("product_id", productId),
  });
  if (existing) {
    if (expiryDate) {
      await db.collection("batches").updateOne(
        { id: existing.id },
        { $set: { expiry_date: expiryDate } }
      );
    }
    return existing.id as string;
  }
  if (type !== "in") throw new Error(`Batch "${normalized}" nathi malto`);
  const batch = {
    batch_no: normalized,
    created_at: nowIso(),
    expiry_date: expiryDate ?? null,
    id: randomUUID(),
    product_id: productId,
  };
  await db.collection("batches").insertOne(batch);
  return batch.id;
}

export async function executeRpc(
  name: string,
  args: DocumentRow,
  user: MongoUser | null
) {
  try {
    if (!user) return error("Not authenticated");
    const db = await prepareDatabase();
    if (name === "lookup_barcode") return { data: await lookupBarcode(db, args), error: null };
    if (name === "record_movement") return { data: await recordMovement(db, args, user), error: null };
    if (name === "transfer_stock") return { data: await transferStock(db, args, user), error: null };
    if (name === "create_sale") return { data: await createSale(db, args, user), error: null };
    if (name === "create_purchase_order") {
      return { data: await createPurchaseOrder(db, args, user), error: null };
    }
    if (name === "receive_purchase_order") {
      return { data: await receivePurchaseOrder(db, args, user), error: null };
    }
    if (name === "cancel_purchase_order") {
      return { data: await cancelPurchaseOrder(db, args), error: null };
    }
    if (name === "create_sale_return") {
      return { data: await createSaleReturn(db, args, user), error: null };
    }
    return error(`Unknown RPC: ${name}`);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Request failed");
  }
}

async function lookupBarcode(db: Db, args: DocumentRow) {
  const barcode = String(args.p_barcode ?? "").trim();
  const product = (await currentStockRows(db)).find(
    (row) => row.barcode === barcode && row.is_active === true
  );
  if (!product) return { barcode, found: false };
  return { found: true, product };
}

async function recordMovement(db: Db, args: DocumentRow, user: MongoUser) {
  const productId = String(args.p_product_id ?? "");
  const type = String(args.p_type ?? "");
  const quantity = toNumber(args.p_quantity);
  if (!["in", "out", "adjustment"].includes(type)) {
    throw new Error(`Invalid movement type: ${type}`);
  }
  if (type !== "adjustment" && quantity <= 0) throw new Error("Quantity 0 thi vadhare hovi joie");
  if (type === "adjustment" && quantity === 0) throw new Error("Adjustment 0 na hoi shake");
  const product = await db.collection("products").findOne(singleIdFilter(productId));
  if (!product) throw new Error("Product not found");
  const locationId = args.p_location_id ? String(args.p_location_id) : await getDefaultLocationId(db);
  const batchId = await resolveBatch(
    db,
    productId,
    type,
    args.p_batch_no,
    args.p_expiry_date,
    args.p_batch_id
  );
  const current = await getLocationStock(db, productId, locationId);
  if (type === "out" && current < quantity) {
    throw new Error(`Aa location par stock ochho che (available: ${current})`);
  }
  if (type === "out" && batchId) {
    const batchStock = await getLocationStock(db, productId, locationId, batchId);
    if (batchStock < quantity) {
      throw new Error(`Aa batch ma stock ochho che (available: ${batchStock})`);
    }
  }
  if (type === "adjustment" && current + quantity < 0) {
    throw new Error(`Adjustment thi stock negative thai jashe (current: ${current})`);
  }
  const movement = {
    batch_id: batchId,
    created_at: nowIso(),
    created_by: user.id,
    id: randomUUID(),
    location_id: locationId,
    product_id: productId,
    quantity,
    reason: args.p_reason ?? null,
    supplier_id: type === "in" ? (args.p_supplier_id ?? null) : null,
    type,
  };
  await db.collection("stock_movements").insertOne(movement);
  const newStock = current + (type === "out" ? -quantity : quantity);
  return { movement_id: movement.id, new_stock: newStock };
}

async function transferStock(db: Db, args: DocumentRow, user: MongoUser) {
  const productId = String(args.p_product_id ?? "");
  const fromId = String(args.p_from_location ?? "");
  const toId = String(args.p_to_location ?? "");
  const quantity = toNumber(args.p_quantity);
  const batchId = args.p_batch_id ? String(args.p_batch_id) : null;
  if (quantity <= 0) throw new Error("Quantity 0 thi vadhare hovi joie");
  if (fromId === toId) throw new Error("From ane To location alag hovi joie");
  const [from, to] = await Promise.all([
    db.collection("locations").findOne({ id: fromId }),
    db.collection("locations").findOne({ id: toId }),
  ]);
  if (!from || !to) throw new Error("Location not found");
  const available = await getLocationStock(db, productId, fromId, batchId);
  if (available < quantity) throw new Error(`${from.name} par stock ochho che (available: ${available})`);
  const transferId = randomUUID();
  const created_at = nowIso();
  await db.collection("stock_movements").insertMany([
    {
      batch_id: batchId,
      created_at,
      created_by: user.id,
      id: randomUUID(),
      location_id: fromId,
      product_id: productId,
      quantity,
      reason: `Transfer -> ${to.name}`,
      transfer_id: transferId,
      type: "out",
    },
    {
      batch_id: batchId,
      created_at,
      created_by: user.id,
      id: randomUUID(),
      location_id: toId,
      product_id: productId,
      quantity,
      reason: `Transfer <- ${from.name}`,
      transfer_id: transferId,
      type: "in",
    },
  ]);
  return { transfer_id: transferId };
}

async function createSale(db: Db, args: DocumentRow, user: MongoUser) {
  const items = Array.isArray(args.p_items) ? args.p_items : [];
  if (items.length === 0) throw new Error("Sale ma ochha ma ochhi 1 item joie");
  const discount = toNumber(args.p_discount);
  if (discount < 0) throw new Error("Discount negative na hoi shake");
  const locationId = args.p_location_id ? String(args.p_location_id) : await getDefaultLocationId(db);
  const products = await db
    .collection("products")
    .find(idFilter(items.map((item) => String(item.product_id ?? ""))))
    .toArray();
  const productMap = new Map(products.map((product) => [rowPublicId(product), product]));

  for (const item of items) {
    const product = productMap.get(String(item.product_id));
    const quantity = toNumber(item.quantity);
    const price = toNumber(item.price);
    if (!product) throw new Error("Product not found");
    if (quantity <= 0) throw new Error("Quantity 0 thi vadhare hovi joie");
    if (price < 0) throw new Error("Price valid nathi");
    const stock = await getLocationStock(db, String(item.product_id), locationId);
    if (stock < quantity) {
      throw new Error(`"${product.name}" no aa location par stock ochho che (available: ${stock})`);
    }
  }

  let subtotal = 0;
  let taxTotal = 0;
  for (const item of items) {
    const product = productMap.get(String(item.product_id))!;
    const line = round2(toNumber(item.quantity) * toNumber(item.price));
    subtotal += line;
    taxTotal += round2((line * toNumber(product.gst_rate)) / 100);
  }
  const grandTotal = round2(subtotal + taxTotal - discount);
  if (grandTotal < 0) throw new Error("Discount total karta vadhare na hoi shake");
  let paidAmount = args.p_paid_amount == null ? grandTotal : toNumber(args.p_paid_amount);
  paidAmount = Math.max(0, Math.min(paidAmount, grandTotal));
  const status = paidAmount >= grandTotal ? "paid" : paidAmount === 0 ? "unpaid" : "partial";
  const settings = await db.collection("business_settings").findOne({ id: 1 });
  const invoiceNo = await nextCode(db, "invoice", settings?.invoice_prefix || "INV");
  const saleId = randomUUID();
  const created_at = nowIso();
  await db.collection("sales").insertOne({
    created_at,
    created_by: user.id,
    customer_id: args.p_customer_id ?? null,
    discount,
    grand_total: grandTotal,
    id: saleId,
    invoice_no: invoiceNo,
    note: args.p_note ?? null,
    paid_amount: paidAmount,
    payment_method: args.p_payment_method ?? "cash",
    status,
    subtotal: round2(subtotal),
    tax_total: round2(taxTotal),
  });

  const saleItems: DocumentRow[] = [];
  const movements: DocumentRow[] = [];
  for (const item of items) {
    const product = productMap.get(String(item.product_id))!;
    const quantity = toNumber(item.quantity);
    const price = toNumber(item.price);
    const saleItemId = randomUUID();
    const productId = rowPublicId(product);
    saleItems.push({
      cost: toNumber(product.purchase_price),
      gst_rate: toNumber(product.gst_rate),
      hsn_code: product.hsn_code ?? null,
      id: saleItemId,
      line_total: round2(quantity * price),
      price,
      product_id: productId,
      product_name: product.name,
      quantity,
      sale_id: saleId,
      unit: product.unit,
    });

    let remaining = quantity;
    const batchRows = (await batchStockRows(db))
      .filter(
        (row) =>
          row.product_id === productId &&
          row.location_id === locationId &&
          toNumber(row.stock) > 0
      )
      .sort((a, b) => String(a.expiry_date ?? "9999").localeCompare(String(b.expiry_date ?? "9999")));
    for (const batch of batchRows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, toNumber(batch.stock));
      movements.push({
        batch_id: batch.batch_id,
        created_at,
        created_by: user.id,
        id: randomUUID(),
        location_id: locationId,
        product_id: productId,
        quantity: take,
        reason: `Sale ${invoiceNo}`,
        sale_id: saleId,
        type: "out",
      });
      remaining -= take;
    }
    if (remaining > 0) {
      movements.push({
        created_at,
        created_by: user.id,
        id: randomUUID(),
        location_id: locationId,
        product_id: productId,
        quantity: remaining,
        reason: `Sale ${invoiceNo}`,
        sale_id: saleId,
        type: "out",
      });
    }
  }
  if (saleItems.length) await db.collection("sale_items").insertMany(saleItems);
  if (movements.length) await db.collection("stock_movements").insertMany(movements);
  return { grand_total: grandTotal, invoice_no: invoiceNo, sale_id: saleId };
}

async function createPurchaseOrder(db: Db, args: DocumentRow, user: MongoUser) {
  const items = Array.isArray(args.p_items) ? args.p_items : [];
  if (items.length === 0) throw new Error("PO ma ochha ma ochhi 1 item joie");
  const products = await db
    .collection("products")
    .find(idFilter(items.map((item) => String(item.product_id ?? ""))))
    .toArray();
  const productMap = new Map(products.map((product) => [rowPublicId(product), product]));
  const poId = randomUUID();
  const poNo = await nextCode(db, "purchase_order", "PO");
  const created_at = nowIso();
  let total = 0;
  const poItems = items.map((item) => {
    const product = productMap.get(String(item.product_id));
    const quantity = toNumber(item.quantity);
    const cost = toNumber(item.cost);
    if (!product) throw new Error("Product not found");
    if (quantity <= 0) throw new Error("Quantity 0 thi vadhare hovi joie");
    if (cost < 0) throw new Error("Cost valid nathi");
    const line = round2(quantity * cost);
    total += line;
    return {
      cost,
      id: randomUUID(),
      line_total: line,
      po_id: poId,
      product_id: rowPublicId(product),
      product_name: product.name,
      quantity,
      unit: product.unit,
    };
  });
  total = round2(total);
  await db.collection("purchase_orders").insertOne({
    created_at,
    created_by: user.id,
    id: poId,
    note: args.p_note ?? null,
    po_no: poNo,
    received_at: null,
    status: "ordered",
    supplier_id: args.p_supplier_id ?? null,
    total,
  });
  await db.collection("purchase_order_items").insertMany(poItems);
  return { po_id: poId, po_no: poNo, total };
}

async function receivePurchaseOrder(db: Db, args: DocumentRow, user: MongoUser) {
  const poId = String(args.p_po_id ?? "");
  const po = await db.collection("purchase_orders").findOne({ id: poId });
  if (!po) throw new Error("PO not found");
  if (po.status !== "ordered") throw new Error(`PO already ${po.status} che`);
  const locationId = args.p_location_id ? String(args.p_location_id) : await getDefaultLocationId(db);
  const items = await db.collection("purchase_order_items").find({ po_id: poId }).toArray();
  const created_at = nowIso();
  const movements = items
    .filter((item) => item.product_id)
    .map((item) => ({
      created_at,
      created_by: user.id,
      id: randomUUID(),
      location_id: locationId,
      po_id: poId,
      product_id: item.product_id,
      quantity: toNumber(item.quantity),
      reason: `PO ${po.po_no}`,
      supplier_id: po.supplier_id ?? null,
      type: "in",
    }));
  if (movements.length) await db.collection("stock_movements").insertMany(movements);
  await db.collection("purchase_orders").updateOne(
    { id: poId },
    { $set: { received_at: nowIso(), status: "received" } }
  );
  return { po_id: poId, status: "received" };
}

async function cancelPurchaseOrder(db: Db, args: DocumentRow) {
  const poId = String(args.p_po_id ?? "");
  const po = await db.collection("purchase_orders").findOne({ id: poId });
  if (!po) throw new Error("PO not found");
  if (po.status !== "ordered") {
    throw new Error(`Fakt ordered PO cancel thai shake (aa ${po.status} che)`);
  }
  await db.collection("purchase_orders").updateOne({ id: poId }, { $set: { status: "cancelled" } });
  return { po_id: poId, status: "cancelled" };
}

async function createSaleReturn(db: Db, args: DocumentRow, user: MongoUser) {
  const saleId = String(args.p_sale_id ?? "");
  const sale = await db.collection("sales").findOne({ id: saleId });
  if (!sale) throw new Error("Sale not found");
  const items = Array.isArray(args.p_items) ? args.p_items : [];
  if (items.length === 0) throw new Error("Return ma ochha ma ochhi 1 item joie");
  const locationId = args.p_location_id ? String(args.p_location_id) : await getDefaultLocationId(db);
  const saleItemIds = items.map((item) => item.sale_item_id);
  const saleItems = await db
    .collection("sale_items")
    .find({ id: { $in: saleItemIds }, sale_id: saleId })
    .toArray();
  const saleItemMap = new Map(saleItems.map((item) => [String(item.id), item]));
  const previous = await db.collection("sale_return_items").find({ sale_item_id: { $in: saleItemIds } }).toArray();
  const returnedMap = new Map<string, number>();
  for (const item of previous) {
    returnedMap.set(String(item.sale_item_id), (returnedMap.get(String(item.sale_item_id)) ?? 0) + toNumber(item.quantity));
  }
  const returnId = randomUUID();
  const returnNo = await nextCode(db, "credit_note", "CN");
  const created_at = nowIso();
  let subtotal = 0;
  let taxTotal = 0;
  const returnItems: DocumentRow[] = [];
  const movements: DocumentRow[] = [];
  for (const item of items) {
    const saleItem = saleItemMap.get(String(item.sale_item_id));
    if (!saleItem) throw new Error("Sale item not found");
    const quantity = toNumber(item.quantity);
    const already = returnedMap.get(String(item.sale_item_id)) ?? 0;
    const max = toNumber(saleItem.quantity) - already;
    if (quantity <= 0) throw new Error("Quantity 0 thi vadhare hovi joie");
    if (quantity > max) {
      throw new Error(`"${saleItem.product_name}" ma vadhu ma vadhu ${max} return thai shake`);
    }
    const line = round2(quantity * toNumber(saleItem.price));
    subtotal += line;
    taxTotal += round2((line * toNumber(saleItem.gst_rate)) / 100);
    returnItems.push({
      gst_rate: toNumber(saleItem.gst_rate),
      id: randomUUID(),
      line_total: line,
      price: toNumber(saleItem.price),
      product_id: saleItem.product_id ?? null,
      product_name: saleItem.product_name,
      quantity,
      return_id: returnId,
      sale_item_id: saleItem.id,
      unit: saleItem.unit,
    });
    if (saleItem.product_id) {
      movements.push({
        created_at,
        created_by: user.id,
        id: randomUUID(),
        location_id: locationId,
        product_id: saleItem.product_id,
        quantity,
        reason: `Return ${returnNo}`,
        return_id: returnId,
        type: "in",
      });
    }
  }
  const total = round2(subtotal + taxTotal);
  await db.collection("sale_returns").insertOne({
    created_at,
    created_by: user.id,
    id: returnId,
    reason: args.p_reason ?? null,
    return_no: returnNo,
    sale_id: saleId,
    subtotal: round2(subtotal),
    tax_total: round2(taxTotal),
    total,
  });
  if (returnItems.length) await db.collection("sale_return_items").insertMany(returnItems);
  if (movements.length) await db.collection("stock_movements").insertMany(movements);
  return { return_id: returnId, return_no: returnNo, total };
}
