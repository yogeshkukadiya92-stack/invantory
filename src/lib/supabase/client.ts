type Filter = { column: string; value: unknown };

function endpoint(table: string) {
  if (table === "current_stock") return "/api/products";
  if (table === "stock_movements") return "/api/stock/movements";
  return `/api/${table}`;
}

class BrowserQuery {
  private filters: Filter[] = [];
  private singleResult = false;

  constructor(private table: string) {}

  select(..._args: unknown[]) {
    return this;
  }

  order(..._args: unknown[]) {
    return this;
  }

  limit(..._args: unknown[]) {
    return this;
  }

  gte(..._args: unknown[]) {
    return this;
  }

  lte(..._args: unknown[]) {
    return this;
  }

  not(..._args: unknown[]) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  single<T = unknown>() {
    this.singleResult = true;
    return this as BrowserQuery & PromiseLike<{ data: T | null; error: null }>;
  }

  async insert(payload: unknown) {
    const response = await fetch(endpoint(this.table), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    return response.ok ? { data: body, error: null } : { data: null, error: body };
  }

  async update(payload: unknown) {
    const id = this.filters.find((filter) => filter.column === "id")?.value;
    const response = await fetch(`${endpoint(this.table)}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    return response.ok ? { data: body, error: null } : { data: null, error: body };
  }

  async delete() {
    const id = this.filters.find((filter) => filter.column === "id")?.value;
    const response = await fetch(`${endpoint(this.table)}/${id}`, {
      method: "DELETE",
    });
    const body = await response.json();
    return response.ok ? { data: body, error: null } : { data: null, error: body };
  }

  async then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    try {
      let url = endpoint(this.table);
      const id = this.filters.find((filter) => filter.column === "id")?.value;
      if (this.singleResult && id && this.table === "products") url = `${url}/${id}`;
      const response = await fetch(url);
      const body = await response.json();
      let data = body.data;
      for (const filter of this.filters) {
        if (filter.column === "is_active") continue;
        if (Array.isArray(data)) {
          data = data.filter(
            (item: Record<string, unknown>) => item[filter.column] === filter.value
          );
        }
      }
      if (this.singleResult && Array.isArray(data)) data = data[0] ?? null;
      return onfulfilled?.({ data, error: null }) as TResult1;
    } catch (error) {
      return onrejected?.(error) as TResult2;
    }
  }
}

export function createClient() {
  return {
    from(table: string) {
      return new BrowserQuery(table);
    },
    rpc(name: string, payload: Record<string, unknown>) {
      if (name === "lookup_barcode") {
        return fetch(`/api/lookup-barcode?barcode=${encodeURIComponent(String(payload.p_barcode ?? ""))}`)
          .then((response) => response.json())
          .then((data) => ({ data, error: null }));
      }
      if (name === "record_movement") {
        return fetch("/api/stock/movements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: payload.p_product_id,
            type: payload.p_type,
            quantity: payload.p_quantity,
            reason: payload.p_reason,
            supplier_id: payload.p_supplier_id,
          }),
        })
          .then(async (response) => {
            const data = await response.json();
            return response.ok ? { data, error: null } : { data: null, error: data };
          });
      }
      return Promise.resolve({ data: null, error: { message: "Unknown RPC" } });
    },
  };
}
