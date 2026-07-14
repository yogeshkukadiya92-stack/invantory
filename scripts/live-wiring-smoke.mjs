import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3107";
const adminEmail = process.env.TEST_ADMIN_EMAIL ?? "admin.livewiring@example.test";
const adminPassword = process.env.TEST_ADMIN_PASSWORD ?? "InventoryLiveTest!2026";
const suffix = String(Date.now());

function cookieFrom(response) {
  const setCookie =
    response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie") ?? "";
  return setCookie.split(";", 1)[0];
}

async function request(path, body, cookie = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON (${response.status}): ${text}`);
  }
  return { cookie: cookieFrom(response), json, status: response.status };
}

function query(table, options = {}) {
  return {
    action: options.action ?? "select",
    table,
    filters: options.filters ?? [],
    orders: options.orders ?? [],
    orFilters: options.orFilters ?? [],
    ...(options.columns ? { columns: options.columns } : {}),
    ...(options.count ? { count: options.count } : {}),
    ...(options.limit ? { limit: options.limit } : {}),
    ...(options.range ? { range: options.range } : {}),
    ...(options.single ? { single: true } : {}),
    ...(options.values !== undefined ? { values: options.values } : {}),
  };
}

function eq(column, value) {
  return { column, op: "eq", value };
}

async function data(cookie, body) {
  return (await request("/api/data", body, cookie)).json;
}

async function rpc(cookie, name, args) {
  return (await request("/api/rpc", { name, args }, cookie)).json;
}

function expectOk(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message ?? "failed"}`);
  return result.data;
}

function expectError(result, pattern, label) {
  assert.ok(result.error, `${label}: expected an error`);
  assert.match(result.error.message, pattern, `${label}: ${result.error.message}`);
}

async function locationStock(cookie, productId, locationId) {
  const result = await data(
    cookie,
    query("location_stock", {
      filters: [eq("product_id", productId), eq("location_id", locationId)],
      single: true,
    })
  );
  const row = expectOk(result, "load location stock");
  return Number(row?.stock ?? 0);
}

async function authenticateAdmin() {
  const signup = await request("/api/auth", {
    action: "signUp",
    email: adminEmail,
    fullName: "Live Wiring Admin",
    password: adminPassword,
  });
  if (!signup.json.error) {
    assert.ok(signup.cookie, "signup did not return a session cookie");
    return signup.cookie;
  }

  const signin = await request("/api/auth", {
    action: "signIn",
    email: adminEmail,
    password: adminPassword,
  });
  expectOk(signin.json, "admin sign in");
  assert.ok(signin.cookie, "sign in did not return a session cookie");
  return signin.cookie;
}

async function run() {
  const cookie = await authenticateAdmin();
  console.log("ok - authentication and session cookie");

  const unauthorized = await request(
    "/api/data",
    query("locations", { columns: "*" })
  );
  assert.equal(unauthorized.status, 401);
  const malformedData = await request("/api/data", { table: "products" }, cookie);
  assert.equal(malformedData.status, 400);
  const malformedRpc = await request("/api/rpc", { name: "create_sale" }, cookie);
  assert.equal(malformedRpc.status, 400);
  console.log("ok - auth guard and malformed-request validation");

  const locations = expectOk(
    await data(cookie, query("locations", { columns: "*" })),
    "load locations"
  );
  const mainLocation = locations.find((location) => location.is_default) ?? locations[0];
  assert.ok(mainLocation?.id, "default location is missing");

  const warehouse = expectOk(
    await data(
      cookie,
      query("locations", {
        action: "insert",
        columns: "*",
        single: true,
        values: { name: `QA Warehouse ${suffix}` },
      })
    ),
    "create secondary location"
  );
  assert.equal(warehouse.is_default, false);
  expectError(
    await data(
      cookie,
      query("locations", {
        action: "insert",
        values: { name: "Spoofed Default", is_default: true },
      })
    ),
    /permission/i,
    "protected location fields"
  );
  expectOk(
    await rpc(cookie, "set_default_location", {
      p_location_id: warehouse.id,
    }),
    "set warehouse as default"
  );
  const warehouseDefaultRows = expectOk(
    await data(cookie, query("locations", { columns: "*" })),
    "reload default location"
  );
  assert.equal(
    warehouseDefaultRows.find((location) => location.id === warehouse.id)?.is_default,
    true
  );
  expectOk(
    await rpc(cookie, "set_default_location", {
      p_location_id: mainLocation.id,
    }),
    "restore main default location"
  );
  console.log("ok - location persistence, default switch, and protected fields");

  const customer = expectOk(
    await data(
      cookie,
      query("customers", {
        action: "insert",
        columns: "*",
        single: true,
        values: { name: `WireCustomer-${suffix}`, phone: "9000000001" },
      })
    ),
    "create customer"
  );
  const supplier = expectOk(
    await data(
      cookie,
      query("suppliers", {
        action: "insert",
        columns: "*",
        single: true,
        values: { name: `WireSupplier-${suffix}`, phone: "9000000002" },
      })
    ),
    "create supplier"
  );

  const barcode = `LW${suffix}`;
  const product = expectOk(
    await rpc(cookie, "create_product", {
      p_location_id: mainLocation.id,
      p_opening_stock: 25,
      p_product: {
        name: `Live Book ${suffix}`,
        sku: `BOOK-${suffix}`,
        barcode,
        category_id: null,
        unit: "pcs",
        purchase_price: 90,
        selling_price: 150,
        mrp: 175,
        weight_grams: 280,
        min_stock_level: 5,
        hsn_code: "4901",
        gst_rate: 5,
        image_url: null,
      },
    }),
    "create stocked product"
  );
  const secondaryProduct = expectOk(
    await rpc(cookie, "create_product", {
      p_location_id: mainLocation.id,
      p_opening_stock: 3,
      p_product: {
        name: `Archive Test ${suffix}`,
        sku: `ARCH-${suffix}`,
        barcode: `AR${suffix}`,
        category_id: null,
        unit: "pcs",
        purchase_price: 20,
        selling_price: 30,
        mrp: null,
        weight_grams: null,
        min_stock_level: 0,
        hsn_code: null,
        gst_rate: 0,
        image_url: null,
      },
    }),
    "create secondary product"
  );
  assert.equal(await locationStock(cookie, product.id, mainLocation.id), 25);
  console.log("ok - product creation and opening stock");

  expectOk(
    await rpc(cookie, "transfer_stock", {
      p_product_id: product.id,
      p_from_location: mainLocation.id,
      p_to_location: warehouse.id,
      p_quantity: 8,
    }),
    "transfer stock"
  );
  assert.equal(await locationStock(cookie, product.id, mainLocation.id), 17);
  assert.equal(await locationStock(cookie, product.id, warehouse.id), 8);

  const mainLookup = expectOk(
    await rpc(cookie, "lookup_barcode", {
      p_barcode: barcode,
      p_location_id: mainLocation.id,
    }),
    "main barcode lookup"
  );
  const warehouseLookup = expectOk(
    await rpc(cookie, "lookup_barcode", {
      p_barcode: barcode,
      p_location_id: warehouse.id,
    }),
    "warehouse barcode lookup"
  );
  assert.equal(Number(mainLookup.product.stock), 17);
  assert.equal(Number(warehouseLookup.product.stock), 8);
  console.log("ok - transfers and location-aware barcode lookup");

  const sale = expectOk(
    await rpc(cookie, "create_sale", {
      p_items: [{ product_id: product.id, quantity: 3, price: 150 }],
      p_customer_id: customer.id,
      p_discount: 0,
      p_payment_method: "cash",
      p_paid_amount: null,
      p_note: "Live wiring sale",
      p_location_id: warehouse.id,
    }),
    "create sale"
  );
  assert.equal(await locationStock(cookie, product.id, warehouse.id), 5);
  expectError(
    await rpc(cookie, "create_sale", {
      p_items: [{ product_id: product.id, quantity: 6, price: 150 }],
      p_customer_id: customer.id,
      p_discount: 0,
      p_payment_method: "cash",
      p_paid_amount: null,
      p_location_id: warehouse.id,
    }),
    /stock ochho/i,
    "overselling guard"
  );
  assert.equal(await locationStock(cookie, product.id, warehouse.id), 5);

  expectOk(
    await rpc(cookie, "update_sale", {
      p_sale_id: sale.sale_id,
      p_items: [{ product_id: product.id, quantity: 4, price: 155 }],
      p_customer_id: customer.id,
      p_discount: 5,
      p_payment_method: "card",
      p_paid_amount: null,
      p_note: "Edited live wiring sale",
      p_location_id: warehouse.id,
    }),
    "edit sale"
  );
  assert.equal(await locationStock(cookie, product.id, warehouse.id), 4);
  console.log("ok - sale create/edit and negative-stock prevention");

  const purchase = expectOk(
    await rpc(cookie, "create_purchase_order", {
      p_items: [{ product_id: product.id, quantity: 10, cost: 90 }],
      p_supplier_id: supplier.id,
      p_note: "Live wiring PO",
      p_receive_now: false,
      p_location_id: null,
    }),
    "create purchase order"
  );
  expectOk(
    await rpc(cookie, "update_purchase_order", {
      p_po_id: purchase.po_id,
      p_items: [{ product_id: product.id, quantity: 12, cost: 88 }],
      p_supplier_id: supplier.id,
      p_note: "Edited before receipt",
      p_location_id: warehouse.id,
    }),
    "edit ordered purchase"
  );
  expectOk(
    await rpc(cookie, "receive_purchase_order", {
      p_po_id: purchase.po_id,
      p_location_id: warehouse.id,
    }),
    "receive purchase"
  );
  assert.equal(await locationStock(cookie, product.id, warehouse.id), 16);
  expectOk(
    await rpc(cookie, "update_purchase_order", {
      p_po_id: purchase.po_id,
      p_items: [{ product_id: product.id, quantity: 10, cost: 89 }],
      p_supplier_id: supplier.id,
      p_note: "Edited after receipt",
      p_location_id: warehouse.id,
    }),
    "edit received purchase"
  );
  assert.equal(await locationStock(cookie, product.id, warehouse.id), 14);
  console.log("ok - purchase create/edit/receive and stock reconciliation");

  const saleItem = expectOk(
    await data(
      cookie,
      query("sale_items", {
        filters: [eq("sale_id", sale.sale_id)],
        single: true,
      })
    ),
    "load sale item for return"
  );
  const saleReturn = expectOk(
    await rpc(cookie, "create_sale_return", {
      p_sale_id: sale.sale_id,
      p_items: [{ sale_item_id: saleItem.id, quantity: 1 }],
      p_reason: "Live wiring return",
      p_location_id: warehouse.id,
    }),
    "create sale return"
  );
  assert.equal(await locationStock(cookie, product.id, warehouse.id), 15);
  expectError(
    await rpc(cookie, "create_sale_return", {
      p_sale_id: sale.sale_id,
      p_items: [{ sale_item_id: saleItem.id, quantity: 4 }],
      p_reason: "Over-return attempt",
      p_location_id: warehouse.id,
    }),
    /vadhu ma vadhu 3/i,
    "over-return guard"
  );
  const returnRow = expectOk(
    await data(
      cookie,
      query("sale_returns", {
        filters: [eq("id", saleReturn.return_id)],
        single: true,
      })
    ),
    "reload sale return"
  );
  assert.equal(returnRow.reason, "Live wiring return");
  assert.equal(Number(returnRow.total), 161.5);
  console.log("ok - sale return, credit note persistence, and over-return guard");

  expectOk(
    await data(
      cookie,
      query("products", {
        action: "update",
        filters: [eq("id", secondaryProduct.id)],
        values: { is_active: false },
      })
    ),
    "deactivate product"
  );
  expectError(
    await rpc(cookie, "create_sale", {
      p_items: [{ product_id: secondaryProduct.id, quantity: 1, price: 30 }],
      p_customer_id: null,
      p_discount: 0,
      p_payment_method: "cash",
      p_paid_amount: null,
      p_location_id: mainLocation.id,
    }),
    /inactive/i,
    "inactive sale guard"
  );
  expectError(
    await rpc(cookie, "create_purchase_order", {
      p_items: [{ product_id: secondaryProduct.id, quantity: 1, cost: 20 }],
      p_supplier_id: null,
      p_receive_now: false,
    }),
    /inactive/i,
    "inactive purchase guard"
  );
  expectOk(
    await data(
      cookie,
      query("products", {
        action: "update",
        filters: [eq("id", secondaryProduct.id)],
        values: { is_active: true },
      })
    ),
    "reactivate product"
  );
  console.log("ok - deactivate/reactivate and inactive transaction guards");

  expectOk(
    await rpc(cookie, "record_movement", {
      p_product_id: product.id,
      p_type: "in",
      p_quantity: 2,
      p_reason: "Batch test",
      p_location_id: mainLocation.id,
      p_batch_no: `BOOK-BATCH-${suffix}`,
      p_expiry_date: null,
    }),
    "create product batch"
  );
  expectOk(
    await rpc(cookie, "record_movement", {
      p_product_id: secondaryProduct.id,
      p_type: "in",
      p_quantity: 1,
      p_reason: "Foreign batch test",
      p_location_id: mainLocation.id,
      p_batch_no: `OTHER-BATCH-${suffix}`,
      p_expiry_date: null,
    }),
    "create foreign product batch"
  );
  const foreignBatch = expectOk(
    await data(
      cookie,
      query("batches", {
        filters: [eq("product_id", secondaryProduct.id)],
        single: true,
      })
    ),
    "load foreign batch"
  );
  expectError(
    await rpc(cookie, "record_movement", {
      p_product_id: product.id,
      p_type: "out",
      p_quantity: 1,
      p_reason: "Invalid batch attempt",
      p_location_id: mainLocation.id,
      p_batch_id: foreignBatch.id,
    }),
    /batch.*valid nathi/i,
    "cross-product batch guard"
  );
  expectError(
    await rpc(cookie, "record_movement", {
      p_product_id: product.id,
      p_type: "out",
      p_quantity: 1000,
      p_reason: "Oversell attempt",
      p_location_id: mainLocation.id,
    }),
    /stock ochho/i,
    "manual stock-out guard"
  );
  expectError(
    await rpc(cookie, "record_movement", {
      p_product_id: product.id,
      p_type: "adjustment",
      p_quantity: -1000,
      p_reason: "Negative adjustment attempt",
      p_location_id: mainLocation.id,
    }),
    /negative/i,
    "negative adjustment guard"
  );
  console.log("ok - batch integrity and manual negative-stock guards");

  const saleSearch = expectOk(
    await data(
      cookie,
      query("sales", {
        columns: "*, customers(name)",
        count: "exact",
        orFilters: [
          `invoice_no.ilike.%${customer.name}%,customer_name.ilike.%${customer.name}%,payment_method.ilike.%${customer.name}%,status.ilike.%${customer.name}%`,
        ],
      })
    ),
    "search sales by customer"
  );
  assert.ok(saleSearch.some((row) => row.id === sale.sale_id));
  const purchaseSearch = expectOk(
    await data(
      cookie,
      query("purchase_orders", {
        columns: "*, suppliers(name)",
        count: "exact",
        orFilters: [
          `po_no.ilike.%${supplier.name}%,supplier_name.ilike.%${supplier.name}%,status.ilike.%${supplier.name}%`,
        ],
      })
    ),
    "search purchases by supplier"
  );
  assert.ok(purchaseSearch.some((row) => row.id === purchase.po_id));
  console.log("ok - server-side sale and purchase search");

  const invitedEmail = `staff.${suffix}@example.test`;
  expectError(
    await data(
      cookie,
      query("allowed_emails", {
        action: "insert",
        values: { email: `spoof.${suffix}@example.test`, added_by: "spoofed" },
      })
    ),
    /permission/i,
    "protected invitation fields"
  );
  expectOk(
    await data(
      cookie,
      query("allowed_emails", {
        action: "insert",
        columns: "*",
        single: true,
        values: { email: invitedEmail.toUpperCase() },
      })
    ),
    "create invitation"
  );
  expectError(
    await data(
      cookie,
      query("allowed_emails", {
        action: "insert",
        values: { email: invitedEmail },
      })
    ),
    /duplicate/i,
    "duplicate invitation guard"
  );
  const staffSignup = await request("/api/auth", {
    action: "signUp",
    email: invitedEmail,
    fullName: "Invited Staff",
    password: "InvitedStaff!2026",
  });
  expectOk(staffSignup.json, "invited staff signup");
  const remainingInvite = expectOk(
    await data(
      cookie,
      query("allowed_emails", {
        filters: [eq("email", invitedEmail)],
      })
    ),
    "check consumed invitation"
  );
  assert.equal(remainingInvite.length, 0);
  console.log("ok - unique invitations and invite consumption");

  expectError(
    await data(
      cookie,
      query("business_settings", {
        action: "update",
        filters: [eq("id", 1)],
        values: { updated_at: "spoofed" },
      })
    ),
    /permission/i,
    "protected settings fields"
  );
  expectOk(
    await data(
      cookie,
      query("business_settings", {
        action: "update",
        filters: [eq("id", 1)],
        values: { name: `Live Wiring QA ${suffix}` },
      })
    ),
    "save business settings"
  );
  const businessSettings = expectOk(
    await data(
      cookie,
      query("business_settings", {
        filters: [eq("id", 1)],
        single: true,
      })
    ),
    "reload business settings"
  );
  assert.equal(businessSettings.name, `Live Wiring QA ${suffix}`);
  const currentStock = expectOk(
    await data(
      cookie,
      query("current_stock", {
        filters: [eq("product_id", product.id)],
        single: true,
      })
    ),
    "load final stock"
  );
  assert.equal(Number(currentStock.stock), 34);
  console.log("ok - protected and persisted settings, final stock (34)");
  console.log(`\nLive wiring smoke test passed against ${baseUrl}`);
}

run().catch((error) => {
  console.error("\nLive wiring smoke test failed:");
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
