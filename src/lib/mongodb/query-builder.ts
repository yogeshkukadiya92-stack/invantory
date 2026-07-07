import type { QueryFilter, QueryOrder, QueryRequest, QueryResult } from "./data";

type QueryExecutor = <T>(request: QueryRequest) => Promise<QueryResult<T>>;

export class MongoQueryBuilder<T = unknown> implements PromiseLike<QueryResult<T>> {
  private request: QueryRequest;

  constructor(table: string, private readonly executor: QueryExecutor) {
    this.request = {
      action: "select",
      filters: [],
      orders: [],
      orFilters: [],
      table,
    };
  }

  select<R = T>(columns = "*", options?: { count?: "exact" }) {
    this.request.columns = columns;
    this.request.count = options?.count;
    return this as unknown as MongoQueryBuilder<R>;
  }

  insert(values: unknown) {
    this.request.action = "insert";
    this.request.values = values;
    return this;
  }

  update(values: unknown) {
    this.request.action = "update";
    this.request.values = values;
    return this;
  }

  delete() {
    this.request.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    return this.addFilter({ column, op: "eq", value });
  }

  gte(column: string, value: unknown) {
    return this.addFilter({ column, op: "gte", value });
  }

  lte(column: string, value: unknown) {
    return this.addFilter({ column, op: "lte", value });
  }

  gt(column: string, value: unknown) {
    return this.addFilter({ column, op: "gt", value });
  }

  in(column: string, values: unknown[]) {
    return this.addFilter({ column, op: "in", value: values });
  }

  not(column: string, modifier: string, value: unknown) {
    return this.addFilter({ column, modifier, op: "not", value });
  }

  or(expression: string) {
    this.request.orFilters.push(expression);
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    const order: QueryOrder = {
      ascending: options?.ascending,
      column,
      nullsFirst: options?.nullsFirst,
    };
    this.request.orders.push(order);
    return this;
  }

  limit(value: number) {
    this.request.limit = value;
    return this;
  }

  range(from: number, to: number) {
    this.request.range = { from, to };
    return this;
  }

  single<R = T>() {
    this.request.single = true;
    return this as unknown as MongoQueryBuilder<R>;
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.executor<T>({ ...this.request }).then(onfulfilled, onrejected);
  }

  private addFilter(filter: QueryFilter) {
    this.request.filters.push(filter);
    return this;
  }
}
