import { cookies } from "next/headers";
import { getMongoConfig } from "./config";
import {
  getCurrentUserFromCookieStore,
  type MongoUser,
} from "./auth";
import {
  executeMongoQuery,
  executeRpc,
  type QueryRequest,
  type QueryResult,
} from "./data";
import { MongoQueryBuilder } from "./query-builder";

async function currentUser() {
  return getCurrentUserFromCookieStore(await cookies());
}

function executor(user: MongoUser | null) {
  return async <T>(request: QueryRequest): Promise<QueryResult<T>> =>
    executeMongoQuery<T>(request, user);
}

export async function createClient(): Promise<any> {
  const user = await currentUser();
  return {
    auth: {
      async getUser() {
        return { data: { user }, error: null };
      },
    },
    from(table: string) {
      return new MongoQueryBuilder(table, executor(user));
    },
    async rpc(name: string, args: Record<string, unknown>) {
      return executeRpc(name, args, user);
    },
  };
}

export { getMongoConfig };
