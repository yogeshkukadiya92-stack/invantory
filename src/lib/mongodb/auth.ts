import {
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import type { Db } from "mongodb";
import { cookies } from "next/headers";
import { getMongoConfig } from "./config";
import { getDb } from "./connection";

export const SESSION_COOKIE = "inventory_session";

export interface MongoUser {
  id: string;
  email: string;
  user_metadata?: { full_name?: string };
}

interface ProfileDocument {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: "admin" | "staff";
  created_at: string;
}

function sign(value: string) {
  const config = getMongoConfig();
  if (!config) throw new Error("MongoDB is not configured");
  return createHmac("sha256", config.sessionSecret).update(value).digest("base64url");
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64).toString("base64url"));
  const expected = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSessionToken(userId: string) {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const signature = parts[2];
  const actual = sign(payload);
  const actualBuffer = Buffer.from(actual);
  const signatureBuffer = Buffer.from(signature);
  if (
    actualBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(actualBuffer, signatureBuffer)
  ) {
    return null;
  }
  return parts[0];
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function getCurrentUserFromCookieStore(
  cookieStore: Awaited<ReturnType<typeof cookies>>
) {
  const userId = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return getUserById(userId);
}

export async function getUserById(userId: string) {
  const db = await getDb();
  const profile = await db
    .collection<ProfileDocument>("profiles")
    .findOne({ id: userId }, { projection: { _id: 0, password_hash: 0 } });
  if (!profile) return null;
  return {
    id: profile.id,
    email: profile.email,
    user_metadata: { full_name: profile.full_name },
  } satisfies MongoUser;
}

export async function signInWithPassword(email: string, password: string) {
  const db = await getDb();
  const profile = await db
    .collection<ProfileDocument>("profiles")
    .findOne({ email: email.trim().toLowerCase() });
  if (!profile || !verifyPassword(password, profile.password_hash)) {
    return { error: { message: "Invalid email or password" }, user: null };
  }
  return {
    error: null,
    token: createSessionToken(profile.id),
    user: {
      id: profile.id,
      email: profile.email,
      user_metadata: { full_name: profile.full_name },
    } satisfies MongoUser,
  };
}

export async function signUpWithPassword({
  email,
  fullName,
  password,
}: {
  email: string;
  fullName: string;
  password: string;
}) {
  const db = await getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const profiles = db.collection<ProfileDocument>("profiles");
  const existing = await profiles.findOne({ email: normalizedEmail });
  if (existing) return { error: { message: "Email already registered" }, user: null };

  const existingCount = await profiles.countDocuments();
  if (existingCount > 0) {
    const invite = await db
      .collection("allowed_emails")
      .findOne({ email: normalizedEmail });
    if (!invite) {
      return {
        error: {
          message:
            "Aa email invited nathi. Admin ne Settings -> Invited emails ma add karva kaho.",
        },
        user: null,
      };
    }
  }

  const now = new Date().toISOString();
  const userId = randomUUID();
  const profile: ProfileDocument = {
    id: userId,
    email: normalizedEmail,
    full_name: fullName.trim(),
    password_hash: hashPassword(password),
    role: existingCount === 0 ? "admin" : "staff",
    created_at: now,
  };
  await profiles.insertOne(profile);
  await ensureDefaults(db);

  return {
    error: null,
    token: createSessionToken(userId),
    user: {
      id: userId,
      email: normalizedEmail,
      user_metadata: { full_name: profile.full_name },
    } satisfies MongoUser,
  };
}

export async function ensureDefaults(db?: Db) {
  const database = db ?? (await getDb());
  const now = new Date().toISOString();
  await database.collection("business_settings").updateOne(
    { id: 1 },
    {
      $setOnInsert: {
        id: 1,
        name: "",
        address: "",
        phone: "",
        gstin: "",
        invoice_prefix: "INV",
        updated_at: now,
      },
    },
    { upsert: true }
  );
  const defaultLocation = await database.collection("locations").findOne({});
  if (!defaultLocation) {
    await database.collection("locations").insertOne({
      id: randomUUID(),
      name: "Main Store",
      is_default: true,
      created_at: now,
    });
  }
}
