export interface MongoConfig {
  dbName: string;
  sessionSecret: string;
  uri: string;
}

export function getMongoConfig(): MongoConfig | null {
  const uri = process.env.MONGODB_URI;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!uri || !sessionSecret) return null;

  return {
    dbName: process.env.MONGODB_DB || "inventory",
    sessionSecret,
    uri,
  };
}

export const mongoSetupMessage =
  "MongoDB is not configured. Set MONGODB_URI and SESSION_SECRET.";
