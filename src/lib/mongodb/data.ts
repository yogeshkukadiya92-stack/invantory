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

declare global {
  // eslint-disable-next-line no-var
  var __inventoryDatabasePreparation: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __inventoryStockMutationQueue: Promise<void> | undefined;
}

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

const VIRTUAL_TABLES = new Set([
  "batch_stock",
  "current_stock",
  "expiring_stock",
  "location_stock",
  "low_stock",
  "sale_items_dated",
]);

const ADMIN_WRITE_TABLES = new Set([
  "allowed_emails",
  "business_settings",
  "categories",
  "locations",
  "profiles",
]);

const NON_DELETABLE_TABLES = new Set([
  "business_settings",
  "products",
  "profiles",
  "stock_movements",
]);

const WRITE_FIELDS: Record<string, Set<string>> = {
  allowed_emails: new Set(["added_by", "email"]),
  business_settings: new Set([
    "address",
    "gstin",
    "invoice_prefix",
    "name",
    "phone",
    "updated_at",
  ]),
  categories: new Set(["name"]),
  customers: new Set(["address", "gstin", "name", "phone"]),
  locations: new Set(["is_default", "name"]),
  products: new Set([
    "barcode",
    "category_id",
    "gst_rate",
    "hsn_code",
    "image_url",
    "is_active",
    "min_stock_level",
    "mrp",
    "name",
    "purchase_price",
    "selling_price",
    "sku",
    "unit",
    "weight_grams",
  ]),
  profiles: new Set(["role"]),
  suppliers: new Set(["address", "name", "phone"]),
};

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function finiteNumber(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} valid number hovu joie`);
  return number;
}

function requireNonNegativeNumber(value: unknown, field: string) {
  const number = finiteNumber(value, field);
  if (number < 0) throw new Error(`${field} negative na hoi shake`);
  return number;
}

function cleanText(value: unknown, field: string, maxLength: number, required = false) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`${field} jaruri che`);
  if (text.length > maxLength) throw new Error(`${field} bahu lambu che`);
  return text;
}

function validateMutationFields(table: string, values: unknown) {
  const allowed = WRITE_FIELDS[table];
  if (!allowed) throw new Error(`${table} direct edit nathi thai shaktu`);
  const rows = Array.isArray(values) ? values : [values];
  for (const value of rows) {
    if (!value || typeof value !== "object") throw new Error("Invalid data");
    const invalid = Object.keys(value as DocumentRow).find((field) => !allowed.has(field));
    if (invalid) throw new Error(`${table}.${invalid} edit karvani permission nathi`);
  }
}

function normalizeProductValues(row: DocumentRow) {
  if ("name" in row) row.name = cleanText(row.name, "Product name", 200, true);
  if ("unit" in row) {
    row.unit = cleanText(row.unit, "Unit", 30, true);
    if (/^-?\d+(\.\d+)?$/.test(row.unit)) {
      throw new Error("Unit ma pcs/kg/box lakho. Quantity alag field ma nakho.");
    }
  }
  for (const field of [
    "purchase_price",
    "selling_price",
    "min_stock_level",
    "gst_rate",
  ]) {
    if (field in row) row[field] = requireNonNegativeNumber(row[field], field);
  }
  if ("gst_rate" in row && toNumber(row.gst_rate) > 100) {
    throw new Error("GST rate 100 karta vadhu na hoi shake");
  }
  for (const field of ["mrp", "weight_grams"]) {
    if (!(field in row)) continue;
    row[field] =
      row[field] === "" || row[field] === null
        ? null
        : requireNonNegativeNumber(row[field], field);
  }
  if ("sku" in row) row.sku = cleanText(row.sku, "SKU", 120) || null;
  if ("barcode" in row) row.barcode = cleanText(row.barcode, "Barcode", 120) || null;
  if ("hsn_code" in row) row.hsn_code = cleanText(row.hsn_code, "HSN code", 40) || null;
  if ("category_id" in row) {
    row.category_id = cleanText(row.category_id, "Category", 120) || null;
  }
  if ("image_url" in row && row.image_url !== null) {
    row.image_url = cleanText(row.image_url, "Image URL", 500);
  }
}

function normalizeSimpleValues(table: string, row: DocumentRow) {
  if (table === "products") normalizeProductValues(row);
  if (table === "customers") {
    if ("name" in row) row.name = cleanText(row.name, "Customer name", 160, true);
    if ("phone" in row) row.phone = cleanText(row.phone, "Phone", 40) || null;
    if ("gstin" in row) row.gstin = cleanText(row.gstin, "GSTIN", 30) || null;
    if ("address" in row) row.address = cleanText(row.address, "Address", 500) || null;
  }
  if (["categories", "locations", "suppliers"].includes(table) && "name" in row) {
    row.name = cleanText(row.name, "Name", 160, true);
  }
  if (table === "suppliers") {
    if ("phone" in row) row.phone = cleanText(row.phone, "Phone", 40) || null;
    if ("address" in row) row.address = cleanText(row.address, "Address", 500) || null;
  }
  if (
    table === "profiles" &&
    "role" in row &&
    !["admin", "staff"].includes(String(row.role))
  ) {
    throw new Error("Invalid role");
  }
  if (table === "allowed_emails" && "email" in row) {
    row.email = cleanText(row.email, "Email", 254, true).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      throw new Error("Valid email nakho");
    }
  }
}

function assertQueryPermission(query: QueryRequest, user: MongoUser | null) {
  if (!user) throw new Error("Not authenticated");
  if (!["select", "insert", "update", "delete"].includes(query.action)) {
    throw new Error("Invalid data action");
  }
  if (!COLLECTIONS.has(query.table) && !VIRTUAL_TABLES.has(query.table)) {
    throw new Error(`Unknown table: ${query.table}`);
  }
  if (query.action === "select") {
    if (query.table === "allowed_emails" && user.role !== "admin") {
      throw new Error("Aa data mate admin role joie");
    }
    return;
  }
  if (VIRTUAL_TABLES.has(query.table)) throw new Error("Aa view edit nathi thai shakti");
  if (query.table === "stock_movements") {
    throw new Error("Stock entries mate approved stock action vapro");
  }
  if (query.table === "products" && query.action === "insert") {
    throw new Error("Product create karva approved product action vapro");
  }
  if (ADMIN_WRITE_TABLES.has(query.table) && user.role !== "admin") {
    throw new Error("Aa action mate admin role joie");
  }
  if (
    query.table === "suppliers" &&
    query.action !== "insert" &&
    user.role !== "admin"
  ) {
    throw new Error("Aa action mate admin role joie");
  }
  if (!WRITE_FIELDS[query.table]) {
    throw new Error(`${query.table} direct edit nathi thai shaktu`);
  }
  if (query.action === "delete" && NON_DELETABLE_TABLES.has(query.table)) {
    throw new Error(`${query.table} delete nathi thai shaktu`);
  }
  if (query.action !== "delete") validateMutationFields(query.table, query.values);
}

function assertUniqueValues(items: DocumentRow[], field: string, label: string) {
  const seen = new Set<string>();
  for (const item of items) {
    const value = String(item[field] ?? "");
    if (!value || seen.has(value)) throw new Error(`${label} duplicate nathi hoi shaktu`);
    seen.add(value);
  }
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

async function serializeStockMutation<T>(operation: () => Promise<T>): Promise<T> {
  const previous = global.__inventoryStockMutationQueue ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  global.__inventoryStockMutationQueue = previous
    .catch(() => undefined)
    .then(() => current);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("profiles").createIndex({ email: 1 }, { unique: true }),
    db.collection("allowed_emails").createIndex({ email: 1 }),
    db.collection("categories").createIndex({ name: 1 }, { unique: true }),
    db.collection("products").createIndex(
      { sku: 1 },
      { sparse: true, unique: true }
    ),
    db.collection("products").createIndex(
      { barcode: 1 },
      { sparse: true, unique: true }
    ),
    db.collection("products").createIndex({ is_active: 1, name: 1 }),
    db.collection("customers").createIndex({ name: 1 }),
    db.collection("locations").createIndex({ name: 1 }, { unique: true }),
    db.collection("suppliers").createIndex({ name: 1 }),
    db.collection("files").createIndex({ bucket: 1, path: 1 }, { unique: true }),
    db.collection("batches").createIndex(
      { product_id: 1, batch_no: 1 },
      { unique: true }
    ),
    db.collection("sales").createIndex({ invoice_no: 1 }, { unique: true }),
    db.collection("sales").createIndex({ created_at: -1 }),
    db.collection("sales").createIndex({ customer_id: 1, created_at: -1 }),
    db.collection("sales").createIndex({ status: 1, created_at: -1 }),
    db.collection("sale_items").createIndex({ sale_id: 1 }),
    db.collection("sale_items").createIndex({ product_id: 1 }),
    db.collection("purchase_orders").createIndex(
      { po_no: 1 },
      { unique: true }
    ),
    db.collection("purchase_orders").createIndex({ created_at: -1 }),
    db.collection("purchase_orders").createIndex({ supplier_id: 1, created_at: -1 }),
    db.collection("purchase_orders").createIndex({ status: 1, created_at: -1 }),
    db.collection("purchase_order_items").createIndex({ po_id: 1 }),
    db.collection("sale_returns").createIndex(
      { return_no: 1 },
      { unique: true }
    ),
    db.collection("sale_returns").createIndex({ created_at: -1 }),
    db.collection("sale_returns").createIndex({ sale_id: 1, created_at: -1 }),
    db.collection("sale_return_items").createIndex({ return_id: 1 }),
    db.collection("sale_return_items").createIndex({ sale_item_id: 1 }),
    db.collection("stock_movements").createIndex({ created_at: -1 }),
    db.collection("stock_movements").createIndex({ product_id: 1, created_at: -1 }),
    db.collection("stock_movements").createIndex({ location_id: 1, product_id: 1 }),
    db.collection("stock_movements").createIndex({ sale_id: 1 }),
    db.collection("stock_movements").createIndex({ return_id: 1 }),
    db.collection("stock_movements").createIndex(
      { repair_key: 1 },
      { sparse: true, unique: true }
    ),
    db.collection("stock_movements").createIndex(
      { po_id: 1, product_id: 1 },
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
  const runPreparation = async () => {
    await ensureDefaults(database);
    await ensureDocumentIds(database);
    await normalizeProducts(database);
    await normalizeStockMovements(database);
    await ensureIndexes(database);
    await repairNegativeStock(database);
  };
  if (db) {
    await runPreparation();
    return database;
  }
  if (!global.__inventoryDatabasePreparation) {
    global.__inventoryDatabasePreparation = runPreparation();
  }
  try {
    await global.__inventoryDatabasePreparation;
  } catch (error) {
    global.__inventoryDatabasePreparation = undefined;
    throw error;
  }
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
    normalizeSimpleValues(table, row);
    if (table === "allowed_emails" && row.email) {
      row.email = String(row.email).trim().toLowerCase();
    }
    if (table !== "allowed_emails" && table !== "business_settings") {
      row.id = randomUUID();
    }
    row.created_at = created;
    if (table === "products") {
      if (row.sku === null || row.sku === "") delete row.sku;
      if (row.barcode === null || row.barcode === "") delete row.barcode;
      row.is_active = row.is_active ?? true;
      row.created_by = user?.id ?? null;
      row.updated_at = row.updated_at ?? created;
    }
    if (table === "stock_movements") {
      row.created_by = user?.id;
      row.location_id = row.location_id ?? null;
    }
    if (table === "allowed_emails") row.added_by = user?.id ?? null;
    if (table === "business_settings") row.updated_at = created;
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
  normalizeSimpleValues(query.table, values);
  const unset: DocumentRow = {};
  if (query.table === "profiles" && values.role === "staff") {
    const adminCount = await db.collection("profiles").countDocuments({ role: "admin" });
    const affectedAdmins = rows.filter((row) => row.role === "admin").length;
    if (affectedAdmins > 0 && adminCount <= affectedAdmins) {
      throw new Error("Ochha ma ochho ek admin jaruri che");
    }
  }
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
    if (values.category_id) {
      const category = await db
        .collection("categories")
        .findOne(singleIdFilter(String(values.category_id)));
      if (!category) throw new Error("Category not found");
    }
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
  if (query.table === "business_settings") values.updated_at = nowIso();
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
    if (rows.some((row) => row.is_default === true)) {
      throw new Error("Default location delete nathi thai shakti");
    }
    const used = await db.collection("stock_movements").findOne({ location_id: { $in: ids } });
    if (used) throw new Error("violates foreign key");
  }
  if (query.table === "suppliers") {
    const used = await db.collection("purchase_orders").findOne({ supplier_id: { $in: ids } });
    if (used) throw new Error("Supplier ni purchase history che");
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
    assertQueryPermission(query, user);
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
    if (name === "create_product") {
      return {
        data: await serializeStockMutation(() => createProduct(db, args, user)),
        error: null,
      };
    }
    if (name === "import_products") {
      return {
        data: await serializeStockMutation(() => importProducts(db, args, user)),
        error: null,
      };
    }
    if (name === "record_movement") {
      return {
        data: await serializeStockMutation(() => recordMovement(db, args, user)),
        error: null,
      };
    }
    if (name === "transfer_stock") {
      return {
        data: await serializeStockMutation(() => transferStock(db, args, user)),
        error: null,
      };
    }
    if (name === "set_default_location") {
      return { data: await setDefaultLocation(db, args, user), error: null };
    }
    if (name === "create_sale") {
      return {
        data: await serializeStockMutation(() => createSale(db, args, user)),
        error: null,
      };
    }
    if (name === "update_sale") {
      return {
        data: await serializeStockMutation(() => updateSale(db, args, user)),
        error: null,
      };
    }
    if (name === "create_purchase_order") {
      return {
        data: await serializeStockMutation(() => createPurchaseOrder(db, args, user)),
        error: null,
      };
    }
    if (name === "update_purchase_order") {
      return {
        data: await serializeStockMutation(() => updatePurchaseOrder(db, args, user)),
        error: null,
      };
    }
    if (name === "receive_purchase_order") {
      return {
        data: await serializeStockMutation(() => receivePurchaseOrder(db, args, user)),
        error: null,
      };
    }
    if (name === "cancel_purchase_order") {
      return { data: await cancelPurchaseOrder(db, args), error: null };
    }
    if (name === "create_sale_return") {
      return {
        data: await serializeStockMutation(() => createSaleReturn(db, args, user)),
        error: null,
      };
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

async function createProduct(db: Db, args: DocumentRow, user: MongoUser) {
  const values = { ...((args.p_product ?? {}) as DocumentRow) };
  validateMutationFields("products", values);
  const [product] = makeInsertRows("products", values, user);
  const openingStock = requireNonNegativeNumber(
    args.p_opening_stock ?? 0,
    "Opening stock"
  );
  const locationId = args.p_location_id
    ? String(args.p_location_id)
    : await getDefaultLocationId(db);
  const location = await db.collection("locations").findOne({ id: locationId });
  if (!location) throw new Error("Location not found");
  if (product.category_id) {
    const category = await db
      .collection("categories")
      .findOne(singleIdFilter(String(product.category_id)));
    if (!category) throw new Error("Category not found");
  }

  await db.collection("products").insertOne(product);
  try {
    if (openingStock > 0) {
      await db.collection("stock_movements").insertOne({
        batch_id: null,
        created_at: nowIso(),
        created_by: user.id,
        id: randomUUID(),
        location_id: locationId,
        product_id: product.id,
        quantity: openingStock,
        reason: "Opening stock",
        supplier_id: null,
        type: "in",
      });
    }
  } catch (error) {
    await db.collection("products").deleteOne({ id: product.id });
    throw error;
  }
  return publicRow(product);
}

async function importProducts(db: Db, args: DocumentRow, user: MongoUser) {
  const sources = Array.isArray(args.p_products) ? args.p_products : [];
  if (sources.length === 0) throw new Error("Import ma ochha ma ochho 1 product joie");
  if (sources.length > 100) throw new Error("Ek vakhat ma vadhu ma vadhu 100 products import karo");
  const locationId = args.p_location_id
    ? String(args.p_location_id)
    : await getDefaultLocationId(db);
  const location = await db.collection("locations").findOne({ id: locationId });
  if (!location) throw new Error("Location not found");

  const products: DocumentRow[] = [];
  const movements: DocumentRow[] = [];
  const seenBarcodes = new Set<string>();
  const seenSkus = new Set<string>();

  for (const source of sources) {
    if (!source || typeof source !== "object") throw new Error("Invalid product row");
    const values = { ...(source as DocumentRow) };
    const openingStock = requireNonNegativeNumber(
      values.opening_stock ?? 0,
      "Opening stock"
    );
    delete values.opening_stock;
    validateMutationFields("products", values);
    const [product] = makeInsertRows("products", values, user);
    const barcode = product.barcode ? String(product.barcode) : "";
    const sku = product.sku ? String(product.sku) : "";
    if (barcode && seenBarcodes.has(barcode)) throw new Error("Import ma duplicate barcode che");
    if (sku && seenSkus.has(sku)) throw new Error("Import ma duplicate SKU che");
    if (barcode) seenBarcodes.add(barcode);
    if (sku) seenSkus.add(sku);
    products.push(product);
    if (openingStock > 0) {
      movements.push({
        batch_id: null,
        created_at: nowIso(),
        created_by: user.id,
        id: randomUUID(),
        location_id: locationId,
        product_id: product.id,
        quantity: openingStock,
        reason: "Opening stock (import)",
        supplier_id: null,
        type: "in",
      });
    }
  }

  const productIds = products.map((product) => product.id);
  const categoryIds = [
    ...new Set(products.map((product) => product.category_id).filter(Boolean).map(String)),
  ];
  if (categoryIds.length > 0) {
    const categoryCount = await db
      .collection("categories")
      .countDocuments(idFilter(categoryIds));
    if (categoryCount !== categoryIds.length) throw new Error("Category not found");
  }
  try {
    await db.collection("products").insertMany(products);
    if (movements.length > 0) {
      await db.collection("stock_movements").insertMany(movements);
    }
  } catch (error) {
    await Promise.all([
      db.collection("stock_movements").deleteMany({ product_id: { $in: productIds } }),
      db.collection("products").deleteMany({ id: { $in: productIds } }),
    ]);
    throw error;
  }

  return { imported: products.length, products: products.map(publicRow) };
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
  const location = await db.collection("locations").findOne({ id: locationId });
  if (!location) throw new Error("Location not found");
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
  try {
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
  } catch (error) {
    await db.collection("stock_movements").deleteMany({ transfer_id: transferId });
    throw error;
  }
  return { transfer_id: transferId };
}

async function setDefaultLocation(db: Db, args: DocumentRow, user: MongoUser) {
  if (user.role !== "admin") throw new Error("Aa action mate admin role joie");
  const locationId = String(args.p_location_id ?? "");
  const location = await db.collection("locations").findOne({ id: locationId });
  if (!location) throw new Error("Location not found");
  await db.collection("locations").bulkWrite([
    {
      updateMany: {
        filter: { is_default: true, id: { $ne: locationId } },
        update: { $set: { is_default: false } },
      },
    },
    {
      updateOne: {
        filter: { id: locationId },
        update: { $set: { is_default: true } },
      },
    },
  ]);
  return { location_id: locationId };
}

async function createSale(db: Db, args: DocumentRow, user: MongoUser) {
  const items = Array.isArray(args.p_items) ? args.p_items : [];
  if (items.length === 0) throw new Error("Sale ma ochha ma ochhi 1 item joie");
  assertUniqueValues(items, "product_id", "Sale product");
  const discount = requireNonNegativeNumber(args.p_discount ?? 0, "Discount");
  const locationId = args.p_location_id ? String(args.p_location_id) : await getDefaultLocationId(db);
  const location = await db.collection("locations").findOne({ id: locationId });
  if (!location) throw new Error("Location not found");
  const products = await db
    .collection("products")
    .find(idFilter(items.map((item) => String(item.product_id ?? ""))))
    .toArray();
  const productMap = new Map(products.map((product) => [rowPublicId(product), product]));

  for (const item of items) {
    const product = productMap.get(String(item.product_id));
    const quantity = finiteNumber(item.quantity, "Quantity");
    const price = requireNonNegativeNumber(item.price, "Price");
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
  const saleRow = {
    created_at,
    created_by: user.id,
    customer_id: args.p_customer_id ?? null,
    discount,
    grand_total: grandTotal,
    id: saleId,
    invoice_no: invoiceNo,
    location_id: locationId,
    note: args.p_note ?? null,
    paid_amount: paidAmount,
    payment_method: args.p_payment_method ?? "cash",
    status,
    subtotal: round2(subtotal),
    tax_total: round2(taxTotal),
  };

  const saleItems: DocumentRow[] = [];
  const movements: DocumentRow[] = [];
  const availableBatches = await batchStockRows(db);
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
    const batchRows = availableBatches
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
  try {
    await db.collection("sales").insertOne(saleRow);
    if (saleItems.length) await db.collection("sale_items").insertMany(saleItems);
    if (movements.length) await db.collection("stock_movements").insertMany(movements);
  } catch (error) {
    await Promise.all([
      db.collection("sale_items").deleteMany({ sale_id: saleId }),
      db.collection("stock_movements").deleteMany({ sale_id: saleId }),
      db.collection("sales").deleteOne({ id: saleId }),
    ]);
    throw error;
  }
  return { grand_total: grandTotal, invoice_no: invoiceNo, sale_id: saleId };
}

async function updateSale(db: Db, args: DocumentRow, user: MongoUser) {
  const saleId = String(args.p_sale_id ?? "");
  const sale = await db.collection("sales").findOne({ id: saleId });
  if (!sale) throw new Error("Sale not found");
  const existingReturns = await db.collection("sale_returns").countDocuments({ sale_id: saleId });
  if (existingReturns > 0) {
    throw new Error("Aa sale par return thayu che, items edit nathi thai shakta");
  }
  const items = Array.isArray(args.p_items) ? args.p_items : [];
  if (items.length === 0) throw new Error("Sale ma ochha ma ochhi 1 item joie");
  assertUniqueValues(items, "product_id", "Sale product");
  const discount = requireNonNegativeNumber(args.p_discount ?? 0, "Discount");
  const [oldMovements, oldSaleItems] = await Promise.all([
    db.collection("stock_movements").find({ sale_id: saleId }).toArray(),
    db.collection("sale_items").find({ sale_id: saleId }).toArray(),
  ]);
  const locationId =
    args.p_location_id ? String(args.p_location_id) :
    oldMovements[0]?.location_id ? String(oldMovements[0].location_id) :
    await getDefaultLocationId(db);
  const location = await db.collection("locations").findOne({ id: locationId });
  if (!location) throw new Error("Location not found");
  const products = await db
    .collection("products")
    .find(idFilter(items.map((item) => String(item.product_id ?? ""))))
    .toArray();
  const productMap = new Map(products.map((product) => [rowPublicId(product), product]));
  const oldOutByProduct = new Map<string, number>();
  for (const movement of oldMovements) {
    if (String(movement.location_id) !== locationId) continue;
    const productId = String(movement.product_id);
    oldOutByProduct.set(productId, (oldOutByProduct.get(productId) ?? 0) + toNumber(movement.quantity));
  }

  for (const item of items) {
    const productId = String(item.product_id ?? "");
    const product = productMap.get(productId);
    const quantity = finiteNumber(item.quantity, "Quantity");
    const price = requireNonNegativeNumber(item.price, "Price");
    if (!product) throw new Error("Product not found");
    if (quantity <= 0) throw new Error("Quantity 0 thi vadhare hovi joie");
    if (price < 0) throw new Error("Price valid nathi");
    const available = await getLocationStock(db, productId, locationId) + (oldOutByProduct.get(productId) ?? 0);
    if (available < quantity) {
      throw new Error(`"${product.name}" no aa location par stock ochho che (available: ${available})`);
    }
  }

  let subtotal = 0;
  let taxTotal = 0;
  const saleItems: DocumentRow[] = [];
  const movements: DocumentRow[] = [];
  const currentBatchRows = await batchStockRows(db);
  const oldBatchOut = new Map<string, number>();
  for (const movement of oldMovements) {
    if (!movement.batch_id || String(movement.location_id) !== locationId) continue;
    const key = `${movement.product_id}\u0000${movement.batch_id}`;
    oldBatchOut.set(key, (oldBatchOut.get(key) ?? 0) + toNumber(movement.quantity));
  }
  const updated_at = nowIso();

  for (const item of items) {
    const product = productMap.get(String(item.product_id))!;
    const productId = rowPublicId(product);
    const quantity = toNumber(item.quantity);
    const price = toNumber(item.price);
    const line = round2(quantity * price);
    subtotal += line;
    taxTotal += round2((line * toNumber(product.gst_rate)) / 100);
    saleItems.push({
      cost: toNumber(product.purchase_price),
      gst_rate: toNumber(product.gst_rate),
      hsn_code: product.hsn_code ?? null,
      id: randomUUID(),
      line_total: line,
      price,
      product_id: productId,
      product_name: product.name,
      quantity,
      sale_id: saleId,
      unit: product.unit,
    });
    let remaining = quantity;
    const batchRows: DocumentRow[] = currentBatchRows
      .filter(
        (row) =>
          row.product_id === productId &&
          row.location_id === locationId
      )
      .map((row): DocumentRow => ({
        ...row,
        stock:
          toNumber(row.stock) +
          (oldBatchOut.get(`${productId}\u0000${row.batch_id}`) ?? 0),
      }))
      .filter((row) => toNumber(row.stock) > 0)
      .sort((left, right) =>
        String(left.expiry_date ?? "9999").localeCompare(
          String(right.expiry_date ?? "9999")
        )
      );
    for (const batch of batchRows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, toNumber(batch.stock));
      movements.push({
        batch_id: batch.batch_id,
        created_at: updated_at,
        created_by: user.id,
        id: randomUUID(),
        location_id: locationId,
        product_id: productId,
        quantity: take,
        reason: `Edited sale ${sale.invoice_no}`,
        sale_id: saleId,
        type: "out",
      });
      remaining -= take;
    }
    if (remaining > 0) {
      movements.push({
        batch_id: null,
        created_at: updated_at,
        created_by: user.id,
        id: randomUUID(),
        location_id: locationId,
        product_id: productId,
        quantity: remaining,
        reason: `Edited sale ${sale.invoice_no}`,
        sale_id: saleId,
        type: "out",
      });
    }
  }

  const grandTotal = round2(subtotal + taxTotal - discount);
  if (grandTotal < 0) throw new Error("Discount total karta vadhare na hoi shake");
  let paidAmount = args.p_paid_amount == null ? grandTotal : toNumber(args.p_paid_amount);
  paidAmount = Math.max(0, Math.min(paidAmount, grandTotal));
  const status = paidAmount >= grandTotal ? "paid" : paidAmount === 0 ? "unpaid" : "partial";

  try {
    await db.collection("sale_items").deleteMany({ sale_id: saleId });
    await db.collection("stock_movements").deleteMany({ sale_id: saleId });
    if (saleItems.length) await db.collection("sale_items").insertMany(saleItems);
    if (movements.length) await db.collection("stock_movements").insertMany(movements);
    await db.collection("sales").updateOne(
      { id: saleId },
      {
        $set: {
        customer_id: args.p_customer_id ?? null,
        discount,
        grand_total: grandTotal,
        location_id: locationId,
        note: args.p_note ?? null,
        paid_amount: paidAmount,
        payment_method: args.p_payment_method ?? sale.payment_method ?? "cash",
        status,
        subtotal: round2(subtotal),
        tax_total: round2(taxTotal),
        updated_at,
        updated_by: user.id,
        },
      }
    );
  } catch (error) {
    await Promise.all([
      db.collection("sale_items").deleteMany({ sale_id: saleId }),
      db.collection("stock_movements").deleteMany({ sale_id: saleId }),
    ]);
    if (oldSaleItems.length) await db.collection("sale_items").insertMany(oldSaleItems);
    if (oldMovements.length) await db.collection("stock_movements").insertMany(oldMovements);
    await db.collection("sales").replaceOne({ id: saleId }, sale);
    throw error;
  }
  return { grand_total: grandTotal, sale_id: saleId };
}

async function createPurchaseOrder(db: Db, args: DocumentRow, user: MongoUser) {
  const items = Array.isArray(args.p_items) ? args.p_items : [];
  if (items.length === 0) throw new Error("PO ma ochha ma ochhi 1 item joie");
  assertUniqueValues(items, "product_id", "Purchase product");
  const receiveNow = args.p_receive_now === true;
  const locationId = args.p_location_id
    ? String(args.p_location_id)
    : await getDefaultLocationId(db);
  if (receiveNow) {
    const location = await db.collection("locations").findOne({ id: locationId });
    if (!location) throw new Error("Location not found");
  }
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
    const quantity = finiteNumber(item.quantity, "Quantity");
    const cost = requireNonNegativeNumber(item.cost, "Cost");
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
  const receivedAt = receiveNow ? nowIso() : null;
  const purchaseRow = {
    created_at,
    created_by: user.id,
    id: poId,
    location_id: receiveNow ? locationId : null,
    note: args.p_note ?? null,
    po_no: poNo,
    received_at: receivedAt,
    status: receiveNow ? "received" : "ordered",
    supplier_id: args.p_supplier_id ?? null,
    total,
  };
  const movements = receiveNow
    ? poItems.map((item) => ({
        created_at: receivedAt,
        created_by: user.id,
        id: randomUUID(),
        location_id: locationId,
        po_id: poId,
        product_id: item.product_id,
        quantity: item.quantity,
        reason: `PO ${poNo}`,
        supplier_id: args.p_supplier_id ?? null,
        type: "in",
      }))
    : [];
  try {
    await db.collection("purchase_orders").insertOne(purchaseRow);
    await db.collection("purchase_order_items").insertMany(poItems);
    if (movements.length) {
      await db.collection("stock_movements").insertMany(movements);
    }
  } catch (error) {
    await Promise.all([
      db.collection("purchase_order_items").deleteMany({ po_id: poId }),
      db.collection("stock_movements").deleteMany({ po_id: poId }),
      db.collection("purchase_orders").deleteOne({ id: poId }),
    ]);
    throw error;
  }
  return {
    po_id: poId,
    po_no: poNo,
    status: receiveNow ? "received" : "ordered",
    total,
  };
}

async function updatePurchaseOrder(db: Db, args: DocumentRow, user: MongoUser) {
  const poId = String(args.p_po_id ?? "");
  const po = await db.collection("purchase_orders").findOne({ id: poId });
  if (!po) throw new Error("PO not found");
  if (po.status === "cancelled") throw new Error("Cancelled PO edit nathi thai shaktu");
  const items = Array.isArray(args.p_items) ? args.p_items : [];
  if (items.length === 0) throw new Error("PO ma ochha ma ochhi 1 item joie");
  assertUniqueValues(items, "product_id", "Purchase product");
  const [oldMovements, oldItems] = await Promise.all([
    db.collection("stock_movements").find({ po_id: poId }).toArray(),
    db.collection("purchase_order_items").find({ po_id: poId }).toArray(),
  ]);
  const originalLocationId = oldMovements[0]?.location_id
    ? String(oldMovements[0].location_id)
    : po.location_id
      ? String(po.location_id)
      : null;
  if (
    po.status === "received" &&
    originalLocationId &&
    args.p_location_id &&
    String(args.p_location_id) !== originalLocationId
  ) {
    throw new Error("Received PO ni stock location badli nathi shakati");
  }
  const locationId =
    originalLocationId ??
    (args.p_location_id
      ? String(args.p_location_id)
      : await getDefaultLocationId(db));
  const location = await db.collection("locations").findOne({ id: locationId });
  if (!location) throw new Error("Location not found");
  const products = await db
    .collection("products")
    .find(idFilter(items.map((item) => String(item.product_id ?? ""))))
    .toArray();
  const productMap = new Map(products.map((product) => [rowPublicId(product), product]));
  const oldInByProduct = new Map<string, number>();
  for (const movement of oldMovements) {
    if (String(movement.location_id) !== locationId) continue;
    const productId = String(movement.product_id);
    oldInByProduct.set(productId, (oldInByProduct.get(productId) ?? 0) + toNumber(movement.quantity));
  }
  if (po.status === "received") {
    for (const [productId, oldQuantity] of oldInByProduct) {
      const availableAfterReverse = await getLocationStock(db, productId, locationId) - oldQuantity;
      if (availableAfterReverse < 0) {
        const product = await db.collection("products").findOne(singleIdFilter(productId));
        throw new Error(`"${product?.name ?? "Product"}" no stock already use thai gayo che, received PO edit nathi thai shaktu`);
      }
    }
  }

  let total = 0;
  const poItems: DocumentRow[] = [];
  for (const item of items) {
    const productId = String(item.product_id ?? "");
    const product = productMap.get(productId);
    const quantity = finiteNumber(item.quantity, "Quantity");
    const cost = requireNonNegativeNumber(item.cost, "Cost");
    if (!product) throw new Error("Product not found");
    if (quantity <= 0) throw new Error("Quantity 0 thi vadhare hovi joie");
    if (cost < 0) throw new Error("Cost valid nathi");
    const line = round2(quantity * cost);
    total += line;
    poItems.push({
      cost,
      id: randomUUID(),
      line_total: line,
      po_id: poId,
      product_id: rowPublicId(product),
      product_name: product.name,
      quantity,
      unit: product.unit,
    });
  }
  total = round2(total);

  const created_at = nowIso();
  const movements =
    po.status === "received"
      ? poItems.filter((item) => item.product_id).map((item) => ({
        created_at,
        created_by: user.id,
        id: randomUUID(),
        location_id: locationId,
        po_id: poId,
        product_id: item.product_id,
        quantity: toNumber(item.quantity),
        reason: `Edited PO ${po.po_no}`,
        supplier_id: args.p_supplier_id ?? po.supplier_id ?? null,
        type: "in",
      }))
      : [];
  try {
    await db.collection("purchase_order_items").deleteMany({ po_id: poId });
    await db.collection("stock_movements").deleteMany({ po_id: poId });
    await db.collection("purchase_order_items").insertMany(poItems);
    if (movements.length) await db.collection("stock_movements").insertMany(movements);
    await db.collection("purchase_orders").updateOne(
      { id: poId },
      {
        $set: {
        note: args.p_note ?? null,
        location_id: po.status === "received" ? locationId : (po.location_id ?? null),
        supplier_id: args.p_supplier_id ?? null,
        total,
        updated_at: nowIso(),
        updated_by: user.id,
        },
      }
    );
  } catch (error) {
    await Promise.all([
      db.collection("purchase_order_items").deleteMany({ po_id: poId }),
      db.collection("stock_movements").deleteMany({ po_id: poId }),
    ]);
    if (oldItems.length) await db.collection("purchase_order_items").insertMany(oldItems);
    if (oldMovements.length) await db.collection("stock_movements").insertMany(oldMovements);
    await db.collection("purchase_orders").replaceOne({ id: poId }, po);
    throw error;
  }
  return { po_id: poId, total };
}

async function receivePurchaseOrder(db: Db, args: DocumentRow, user: MongoUser) {
  const poId = String(args.p_po_id ?? "");
  const po = await db.collection("purchase_orders").findOne({ id: poId });
  if (!po) throw new Error("PO not found");
  if (po.status !== "ordered") throw new Error(`PO already ${po.status} che`);
  const locationId = args.p_location_id ? String(args.p_location_id) : await getDefaultLocationId(db);
  const location = await db.collection("locations").findOne({ id: locationId });
  if (!location) throw new Error("Location not found");
  const items = await db.collection("purchase_order_items").find({ po_id: poId }).toArray();
  const created_at = nowIso();
  const receiptId = randomUUID();
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
      receipt_id: receiptId,
      reason: `PO ${po.po_no}`,
      supplier_id: po.supplier_id ?? null,
      type: "in",
    }));
  try {
    if (movements.length) await db.collection("stock_movements").insertMany(movements);
    const update = await db.collection("purchase_orders").updateOne(
      { id: poId, status: "ordered" },
      { $set: { location_id: locationId, received_at: nowIso(), status: "received" } }
    );
    if (update.modifiedCount !== 1) throw new Error("PO status badlai gayu che");
  } catch (error) {
    await db.collection("stock_movements").deleteMany({ receipt_id: receiptId });
    throw error;
  }
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
  assertUniqueValues(items, "sale_item_id", "Return item");
  const saleMovement = await db.collection("stock_movements").findOne({ sale_id: saleId, type: "out" });
  const locationId = args.p_location_id
    ? String(args.p_location_id)
    : sale.location_id
      ? String(sale.location_id)
      : saleMovement?.location_id
        ? String(saleMovement.location_id)
        : await getDefaultLocationId(db);
  const location = await db.collection("locations").findOne({ id: locationId });
  if (!location) throw new Error("Location not found");
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
    const quantity = finiteNumber(item.quantity, "Quantity");
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
      cost: saleItem.cost == null ? null : toNumber(saleItem.cost),
      created_at,
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
  const grossTotal = round2(subtotal + taxTotal);
  const saleGrossTotal = round2(toNumber(sale.subtotal) + toNumber(sale.tax_total));
  const proportionalDiscount =
    saleGrossTotal > 0
      ? round2((grossTotal * toNumber(sale.discount)) / saleGrossTotal)
      : 0;
  const previousReturns = await db
    .collection("sale_returns")
    .find({ sale_id: saleId })
    .toArray();
  const previouslyRefunded = round2(
    previousReturns.reduce((sum, previousReturn) => sum + toNumber(previousReturn.total), 0)
  );
  const refundableBalance = Math.max(0, round2(toNumber(sale.grand_total) - previouslyRefunded));
  const total = Math.min(round2(grossTotal - proportionalDiscount), refundableBalance);
  const returnDiscount = round2(grossTotal - total);
  const returnRow = {
    created_at,
    created_by: user.id,
    discount: returnDiscount,
    id: returnId,
    location_id: locationId,
    reason: args.p_reason ?? null,
    return_no: returnNo,
    sale_id: saleId,
    subtotal: round2(subtotal),
    tax_total: round2(taxTotal),
    total,
  };
  try {
    await db.collection("sale_returns").insertOne(returnRow);
    if (returnItems.length) await db.collection("sale_return_items").insertMany(returnItems);
    if (movements.length) await db.collection("stock_movements").insertMany(movements);
  } catch (error) {
    await Promise.all([
      db.collection("sale_return_items").deleteMany({ return_id: returnId }),
      db.collection("stock_movements").deleteMany({ return_id: returnId }),
      db.collection("sale_returns").deleteOne({ id: returnId }),
    ]);
    throw error;
  }
  return { return_id: returnId, return_no: returnNo, total };
}
