import { MongoClient, type Db } from "mongodb";
import { getMongoConfig } from "./config";

let clientPromise: Promise<MongoClient> | null = null;

declare global {
  // eslint-disable-next-line no-var
  var __inventoryMongoClientPromise: Promise<MongoClient> | undefined;
}

export async function getDb(): Promise<Db> {
  const config = getMongoConfig();
  if (!config) {
    throw new Error(
      "MongoDB is not configured. Set MONGODB_URI and a SESSION_SECRET of at least 32 characters."
    );
  }

  if (process.env.NODE_ENV === "development") {
    if (!global.__inventoryMongoClientPromise) {
      const client = new MongoClient(config.uri);
      global.__inventoryMongoClientPromise = client.connect();
    }
    return (await global.__inventoryMongoClientPromise).db(config.dbName);
  }

  if (!clientPromise) {
    const client = new MongoClient(config.uri);
    clientPromise = client.connect();
  }
  return (await clientPromise).db(config.dbName);
}
