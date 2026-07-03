import { MongoClient, ObjectId, type Db } from "mongodb";

const dbName = process.env.MONGODB_DB ?? "inventory";

let clientPromise: Promise<MongoClient> | undefined;

const globalForMongo = globalThis as typeof globalThis & {
  _inventoryMongoClientPromise?: Promise<MongoClient>;
};

function getClientPromise() {
  const uri =
    process.env.MONGODB_URI ??
    process.env.MONGO_URL ??
    process.env.MONGO_URI ??
    process.env.DATABASE_URL;

  if (!uri) {
    throw new Error(
      "Missing MongoDB connection string. Set MONGODB_URI or MONGO_URL in Railway."
    );
  }

  if (process.env.NODE_ENV === "development") {
    if (!globalForMongo._inventoryMongoClientPromise) {
      globalForMongo._inventoryMongoClientPromise = new MongoClient(uri).connect();
    }
    return globalForMongo._inventoryMongoClientPromise;
  }

  if (!clientPromise) clientPromise = new MongoClient(uri).connect();
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(dbName);
}

export function toObjectId(id: string) {
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}
