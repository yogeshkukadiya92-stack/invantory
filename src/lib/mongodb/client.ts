import type { QueryRequest, QueryResult } from "./data";
import { MongoQueryBuilder } from "./query-builder";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return {
      data: null,
      error: { message: text || response.statusText || "Request failed" },
    } as T;
  }
}

async function executeQuery<T>(request: QueryRequest): Promise<QueryResult<T>> {
  return postJson<QueryResult<T>>("/api/data", request);
}

let browserClient: any;

export function createClient(): any {
  if (browserClient) return browserClient;

  browserClient = {
    auth: {
      async getUser() {
        return postJson("/api/auth", { action: "getUser" });
      },
      async signInWithPassword(credentials: { email: string; password: string }) {
        return postJson("/api/auth", { action: "signIn", ...credentials });
      },
      async signOut() {
        return postJson("/api/auth", { action: "signOut" });
      },
      async signUp(payload: {
        email: string;
        options?: { data?: { full_name?: string } };
        password: string;
      }) {
        return postJson("/api/auth", {
          action: "signUp",
          email: payload.email,
          fullName: payload.options?.data?.full_name ?? "",
          password: payload.password,
        });
      },
    },
    from(table: string) {
      return new MongoQueryBuilder(table, executeQuery);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      return postJson("/api/rpc", { args, name });
    },
    storage: {
      from(bucket: string) {
        return {
          getPublicUrl(path: string) {
            return { data: { publicUrl: `/api/storage/${encodeURIComponent(path)}` } };
          },
          async upload(path: string, file: File, options?: { upsert?: boolean }) {
            const formData = new FormData();
            formData.set("bucket", bucket);
            formData.set("path", path);
            formData.set("upsert", options?.upsert ? "true" : "false");
            formData.set("file", file);
            const response = await fetch("/api/storage", {
              body: formData,
              method: "POST",
            });
            return response.json();
          },
        };
      },
    },
  };
  return browserClient;
}
