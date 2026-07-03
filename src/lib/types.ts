export type Role = "admin" | "staff";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
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
  image_url: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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

export interface PurchaseOrder {
  id: string;
  product_id: string;
  supplier_id: string | null;
  quantity: number;
  unit_cost: number;
  reference: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  products?: { name: string; unit: string } | null;
  suppliers?: { name: string } | null;
  profiles?: { full_name: string } | null;
}

export interface TransferRecord {
  id: string;
  product_id: string;
  quantity: number;
  from_location: string;
  to_location: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  products?: { name: string; unit: string } | null;
  profiles?: { full_name: string } | null;
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
