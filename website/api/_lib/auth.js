import crypto from "node:crypto";
import { promisify } from "node:util";
import { query } from "./db.js";
import { HttpError, parseCookies } from "./util.js";
import { DEFAULT_ROLE_PERMS, EDITABLE_ROLES, effectivePerms, cleanPermList } from "./perms.js";

const scrypt = promisify(crypto.scrypt);
export const COOKIE = "__Host-bsess";
const SESSION_DAYS = 7;

/* ---------- Passwords (scrypt) ---------- */

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(pw, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(N), r: Number(r), p: Number(p),
  });
  return crypto.timingSafeEqual(key, expected);
}

// Used when the username does not exist, so a wrong username takes as long as a wrong password.
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

/* ---------- Owners come from the OWNER_ACCOUNTS env variable ---------- */

export function owners() {
  try {
    const list = JSON.parse(process.env.OWNER_ACCOUNTS || "[]");
    return list
      .filter((o) => o && typeof o.u === "string" && typeof o.h === "string")
      .map((o) => ({ username: o.u, hash: o.h }));
  } catch {
    console.error("OWNER_ACCOUNTS is not valid JSON");
    return [];
  }
}

export function findOwner(name) {
  const key = String(name || "").toLowerCase();
  return owners().find((o) => o.username.toLowerCase() === key) || null;
}

/* ---------- Signed session tokens ---------- */

function secret() {
  const s = process.env.SESSION_SECRET || "";
  if (s.length < 32) throw new HttpError(503, "SESSION_SECRET is not set up yet");
  return s;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function unsign(token) {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const good = crypto.createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== good.length || !crypto.timingSafeEqual(given, good)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export function sessionCookie(payload) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const token = sign({ ...payload, exp });
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

/* ---------- Roles ---------- */

export async function rolePerms() {
  const rows = await query("SELECT role, perms FROM role_perms", []);
  const out = {};
  for (const role of EDITABLE_ROLES) out[role] = [...DEFAULT_ROLE_PERMS[role]];
  for (const r of rows) if (EDITABLE_ROLES.includes(r.role)) out[r.role] = cleanPermList(r.perms);
  return out;
}

/* ---------- Who is calling? ---------- */

export async function getSession(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const p = unsign(token);
  if (!p) return null;

  if (p.o) {
    const owner = findOwner(p.u);
    if (!owner) return null;
    return {
      id: null,
      username: owner.username,
      display_name: owner.username,
      role: "owner",
      owner: true,
      perms: effectivePerms("owner"),
    };
  }

  const rows = await query(
    "SELECT id, username, display_name, role, overrides, disabled, token_version FROM users WHERE id = $1",
    [p.u]
  );
  const u = rows[0];
  if (!u || u.disabled || u.token_version !== p.v) return null;
  const roles = await rolePerms();
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name || u.username,
    role: u.role,
    owner: false,
    overrides: u.overrides || {},
    perms: effectivePerms(u.role, roles[u.role], u.overrides),
  };
}

export async function requireUser(req) {
  const user = await getSession(req);
  if (!user) throw new HttpError(401, "Please log in again");
  return user;
}

export function can(user, perm) {
  return user.role === "owner" || user.perms.includes(perm);
}

export function requirePerm(user, perm) {
  if (!can(user, perm)) throw new HttpError(403, "You do not have permission to do that");
}

export { DUMMY_HASH };
