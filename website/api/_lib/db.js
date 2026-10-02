import { neon } from "@neondatabase/serverless";
import { HttpError } from "./util.js";

// Tables are created the first time a query finds one missing,
// so a fresh database needs no manual setup.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id SERIAL PRIMARY KEY,
     username TEXT NOT NULL,
     username_key TEXT NOT NULL UNIQUE,
     display_name TEXT NOT NULL DEFAULT '',
     role TEXT NOT NULL,
     pass_hash TEXT NOT NULL,
     overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
     disabled BOOLEAN NOT NULL DEFAULT false,
     token_version INT NOT NULL DEFAULT 0,
     created_by TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_login TIMESTAMPTZ
   )`,
  `CREATE TABLE IF NOT EXISTS role_perms (
     role TEXT PRIMARY KEY,
     perms JSONB NOT NULL,
     updated_by TEXT,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS content (
     key TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     value TEXT NOT NULL,
     updated_by TEXT,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS media (
     id TEXT PRIMARY KEY,
     mime TEXT NOT NULL,
     data TEXT NOT NULL,
     size INT NOT NULL,
     name TEXT,
     created_by TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS notices (
     id SERIAL PRIMARY KEY,
     title TEXT NOT NULL,
     body TEXT NOT NULL,
     active BOOLEAN NOT NULL DEFAULT true,
     frequency TEXT NOT NULL DEFAULT 'always',
     pinned BOOLEAN NOT NULL DEFAULT false,
     created_by TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_by TEXT,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS stats (
     day DATE NOT NULL,
     event TEXT NOT NULL,
     count INT NOT NULL DEFAULT 0,
     PRIMARY KEY (day, event)
   )`,
  `CREATE TABLE IF NOT EXISTS audit (
     id SERIAL PRIMARY KEY,
     at TIMESTAMPTZ NOT NULL DEFAULT now(),
     username TEXT,
     action TEXT NOT NULL,
     detail JSONB
   )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
     key TEXT PRIMARY KEY,
     count INT NOT NULL,
     first_at TIMESTAMPTZ NOT NULL
   )`,
];

let client = null;
let schemaPromise = null;

function raw(text, params) {
  // Local tests plug in their own database here.
  if (globalThis.__bjQuery) return globalThis.__bjQuery(text, params);
  if (!client) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new HttpError(503, "The database is not connected yet");
    client = neon(url);
  }
  return client.query(text, params);
}

function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const stmt of SCHEMA) await raw(stmt, []);
    })().catch((e) => {
      schemaPromise = null;
      throw e;
    });
  }
  return schemaPromise;
}

export async function query(text, params = []) {
  try {
    return await raw(text, params);
  } catch (e) {
    if (e && e.code === "42P01") {
      // "relation does not exist": first run on a new database
      await ensureSchema();
      return raw(text, params);
    }
    throw e;
  }
}

export function dbConfigured() {
  return Boolean(globalThis.__bjQuery || process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export async function audit(username, action, detail = null) {
  try {
    await query("INSERT INTO audit (username, action, detail) VALUES ($1, $2, $3::jsonb)", [
      username,
      action,
      detail ? JSON.stringify(detail) : null,
    ]);
  } catch (e) {
    console.error("audit failed", e);
  }
}
