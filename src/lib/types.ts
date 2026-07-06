export type Role = "admin" | "staff";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  created_at: string;
}

/** Invite-only signup list */
export interface AllowedEmail {
  email: string;
  added_by: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  unit: string;
  purchase_price: number;
  selling_price: number;
  min_stock_level: number;
  hsn_code: string | null;
  gst_rate: number;
  image_url: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  created_at: string;
}

/** business_settings single-row table */
export interface BusinessSettings {
  id: number;
  name: string;
  address: string;
  phone: string;
  gstin: string;
  invoice_prefix: string;
  updated_at: string;
}

export type SaleStatus = "paid" | "unpaid" | "partial";

export interface Sale {
  id: string;
  invoice_no: string;
  customer_id: string | null;
  status: SaleStatus;
  payment_method: string;
  subtotal: number;
  discount: number;
  tax_total: number;
  grand_total: number;
  paid_amount: number;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  hsn_code: string | null;
  unit: string;
  quantity: number;
  price: number;
  gst_rate: number;
  line_total: number;
}

/** create_sale RPC no response */
export interface CreateSaleResult {
  sale_id: string;
  invoice_no: string;
  grand_total: number;
}

export interface SaleReturn {
  id: string;
  return_no: string;
  sale_id: string;
  reason: string | null;
  subtotal: number;
  tax_total: number;
  total: number;
  created_by: string;
  created_at: string;
}

export interface SaleReturnItem {
  id: string;
  return_id: string;
  sale_item_id: string;
  product_id: string | null;
  product_name: string;
  unit: string;
  quantity: number;
  price: number;
  gst_rate: number;
  line_total: number;
}

export type POStatus = "ordered" | "received" | "cancelled";

export interface PurchaseOrder {
  id: string;
  po_no: string;
  supplier_id: string | null;
  status: POStatus;
  note: string | null;
  total: number;
  created_by: string;
  created_at: string;
  received_at: string | null;
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  product_id: string | null;
  product_name: string;
  unit: string;
  quantity: number;
  cost: number;
  line_total: number;
}

export interface Location {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
}

export interface Batch {
  id: string;
  product_id: string;
  batch_no: string;
  expiry_date: string | null;
  created_at: string;
}

/** location_stock view no ek row */
export interface LocationStockRow {
  product_id: string;
  name: string;
  unit: string;
  is_active: boolean;
  location_id: string;
  location_name: string;
  stock: number;
}

/** batch_stock / expiring_stock view no ek row */
export interface BatchStockRow {
  product_id: string;
  product_name: string;
  unit: string;
  batch_id: string;
  batch_no: string;
  expiry_date: string | null;
  location_id: string;
  location_name: string;
  stock: number;
}

export type MovementType = "in" | "out" | "adjustment";

export interface StockMovement {
  id: string;
  product_id: string;
  type: MovementType;
  quantity: number;
  reason: string | null;
  supplier_id: string | null;
  created_by: string;
  created_at: string;
}

/** current_stock view no ek row */
export interface StockRow {
  product_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  min_stock_level: number;
  selling_price: number;
  purchase_price: number;
  category_id: string | null;
  is_active: boolean;
  stock: number;
  stock_value: number;
  hsn_code: string | null;
  gst_rate: number;
  image_url: string | null;
}

/** lookup_barcode RPC no response */
export type BarcodeLookup =
  | { found: true; product: StockRow }
  | { found: false; barcode: string };

/** record_movement RPC no response */
export interface MovementResult {
  movement_id: string;
  new_stock: number;
}
