import { getDb } from "@/lib/mongodb";
import { getStockRows } from "@/lib/inventory";

class ServerQuery {
  private filters: { column: string; value: unknown }[] = [];
  private rowLimit = 0;

  constructor(private table: string) {}

  select(..._args: unknown[]) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  order(..._args: unknown[]) {
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  async then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    try {
      let data: unknown[] = [];
      if (this.table === "current_stock") {
        data = await getStockRows(true);
      } else if (this.table === "low_stock") {
        data = (await getStockRows(true)).filter((row) => row.stock <= row.min_stock_level);
      } else if (this.table === "stock_movements") {
        const db = await getDb();
        const movements = await db
          .collection("stock_movements")
          .find({})
          .sort({ created_at: -1 })
          .limit(this.rowLimit || 100)
          .toArray();
        const rows = await getStockRows(false);
        const productById = new Map(rows.map((row) => [row.product_id, row]));
        data = movements.map((movement) => ({
          id: String(movement._id),
          type: movement.type,
          quantity: movement.quantity,
          created_at: movement.created_at,
          products: productById.get(movement.product_id)
            ? { name: productById.get(movement.product_id)!.name }
            : null,
        }));
      }
      for (const filter of this.filters) {
        data = data.filter(
          (item) => (item as Record<string, unknown>)[filter.column] === filter.value
        );
      }
      if (this.rowLimit) data = data.slice(0, this.rowLimit);
      return onfulfilled?.({ data, error: null }) as TResult1;
    } catch (error) {
      return onrejected?.(error) as TResult2;
    }
  }
}

export async function createClient() {
  return {
    from(table: string) {
      return new ServerQuery(table);
    },
  };
}
