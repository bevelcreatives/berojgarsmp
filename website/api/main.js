// One function handles every /api/* route (vercel.json rewrites them here).
import crypto from "node:crypto";
import { query, audit, dbConfigured } from "./_lib/db.js";
import {
  hashPassword, verifyPassword, owners, findOwner, sessionCookie, clearCookie,
  getSession, requireUser, requirePerm, rolePerms, DUMMY_HASH,
} from "./_lib/auth.js";
import {
  CATALOG, RANK, EDITABLE_ROLES, effectivePerms, cleanOverrides, cleanPermList,
} from "./_lib/perms.js";
import { sanitizeHtml, validImageSrc, KEY_RE } from "./_lib/sanitize.js";
import { HttpError, send, readJson, clientIp, assertSameOrigin, str } from "./_lib/util.js";

const TRACK_EVENTS = new Set([
  "page_view", "visitor", "discord_click", "ip_copy", "port_copy", "join_guide_click", "notice_ack",
]);
const IMAGE_TYPES = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/gif": [0x47, 0x49, 0x46],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
};
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const TODAY = "(now() AT TIME ZONE 'Asia/Kathmandu')::date";

/* =========================================================
   Router
   ========================================================= */
export default async function handler(req, res) {
  // Awaited here so errors from every async route land in this catch.
  try {
    await route(req, res);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    return send(res, 500, { error: "Something went wrong on our side" });
  }
}

async function route(req, res) {
  const url = new URL(req.url, "http://local");
  const path = (url.searchParams.get("__route") ?? url.pathname.replace(/^\/api\/?/, ""))
    .replace(/^\/+|\/+$/g, "");
  const [a = "", b = ""] = path.split("/");
  const m = req.method;
  const q = url.searchParams;

  if (m !== "GET" && m !== "HEAD") assertSameOrigin(req);

  // ---- public ----
  if (a === "public" && m === "GET") return publicData(req, res);
  if (a === "track" && m === "POST") return track(req, res);
  if (a === "media" && b && m === "GET") return getMedia(res, b);
  if (a === "health" && m === "GET") {
    // Setup flags only (never values), so config problems can be spotted from outside.
    const secret = (process.env.SESSION_SECRET || "").length >= 32;
    return send(res, 200, { ok: true, db: dbConfigured(), session: secret, owners: owners().length });
  }

  // ---- auth ----
  if (a === "auth") {
    if (b === "login" && m === "POST") return login(req, res);
    if (b === "logout" && m === "POST") return send(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
    if (b === "me" && m === "GET") return me(req, res);
  }

  const user = await requireUser(req);

  if (a === "account") {
    if (!b && m === "PATCH") return updateAccount(req, res, user);
    if (b === "password" && m === "POST") return changeOwnPassword(req, res, user);
  }
  if (a === "notices") {
    if (!b && m === "GET") return listNotices(res, user);
    if (!b && m === "POST") return createNotice(req, res, user);
    if (b && m === "PATCH") return updateNotice(req, res, user, b);
    if (b && m === "DELETE") return deleteNotice(res, user, b);
  }
  if (a === "content") {
    if (m === "GET") return listContent(res, user);
    if (m === "PUT") return saveContent(req, res, user);
  }
  if (a === "media" && !b && m === "POST") return uploadMedia(req, res, user);
  if (a === "stats") {
    if (m === "GET") return getStats(res, user, q);
    if (m === "DELETE") return resetStats(res, user);
  }
  if (a === "users") {
    if (!b && m === "GET") return listUsers(res, user);
    if (!b && m === "POST") return createUser(req, res, user);
    if (b && m === "PATCH") return updateUser(req, res, user, b);
    if (b && m === "DELETE") return deleteUser(res, user, b);
  }
  if (a === "roles" && b && m === "PUT") return updateRole(req, res, user, b);
  if (a === "audit" && m === "GET") return listAudit(res, user, q);

  throw new HttpError(404, "Not found");
}

/* =========================================================
   Public: content + notices for the website, stats tracking, images
   ========================================================= */
async function publicData(req, res) {
  const url = new URL(req.url, "http://local");
  const cache = url.searchParams.has("fresh")
    ? "no-store"
    : "public, max-age=0, s-maxage=10, stale-while-revalidate=60";
  if (!dbConfigured()) return send(res, 200, { content: {}, notices: [] }, { "Cache-Control": cache });

  const [rows, notices] = await Promise.all([
    query("SELECT key, kind, value FROM content", []),
    query(
      `SELECT id, title, body, frequency, pinned, updated_at FROM notices
       WHERE active ORDER BY pinned DESC, created_at DESC LIMIT 20`,
      []
    ),
  ]);
  const content = {};
  for (const r of rows) content[r.key] = { k: r.kind, v: r.value };
  send(res, 200, { content, notices }, { "Cache-Control": cache });
}

async function track(req, res) {
  if (!dbConfigured()) return send(res, 204);
  const body = await readJson(req, 4096);
  const events = [...new Set(Array.isArray(body.e) ? body.e : [])].filter((e) => TRACK_EVENTS.has(e)).slice(0, 8);
  if (events.length) {
    await query(
      `INSERT INTO stats (day, event, count)
       SELECT ${TODAY}, e, 1 FROM unnest($1::text[]) AS t(e)
       ON CONFLICT (day, event) DO UPDATE SET count = stats.count + 1`,
      [events]
    );
  }
  send(res, 204);
}

async function getMedia(res, id) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new HttpError(404, "Not found");
  const rows = await query("SELECT mime, data FROM media WHERE id = $1", [id]);
  if (!rows[0]) throw new HttpError(404, "Not found");
  send(res, 200, Buffer.from(rows[0].data, "base64"), {
    "Content-Type": rows[0].mime,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
}

/* =========================================================
   Auth
   ========================================================= */
const MAX_FAILS = 8;
const WINDOW = "15 minutes";

async function tooManyFails(keys) {
  const rows = await query(
    `SELECT count FROM login_attempts WHERE key = ANY($1::text[]) AND first_at > now() - interval '${WINDOW}'`,
    [keys]
  );
  return rows.some((r) => r.count >= MAX_FAILS);
}

async function recordFail(keys) {
  for (const key of keys) {
    await query(
      `INSERT INTO login_attempts (key, count, first_at) VALUES ($1, 1, now())
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN login_attempts.first_at < now() - interval '${WINDOW}' THEN 1 ELSE login_attempts.count + 1 END,
         first_at = CASE WHEN login_attempts.first_at < now() - interval '${WINDOW}' THEN now() ELSE login_attempts.first_at END`,
      [key]
    );
  }
}

async function login(req, res) {
  const body = await readJson(req, 4096);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) throw new HttpError(400, "Enter your username and password");

  const keys = [`ip:${clientIp(req)}`, `u:${username.toLowerCase()}`];
  if (await tooManyFails(keys)) throw new HttpError(429, "Too many wrong tries. Wait 15 minutes and try again.");

  const owner = findOwner(username);
  if (owner) {
    if (await verifyPassword(password, owner.hash)) {
      await query("DELETE FROM login_attempts WHERE key = ANY($1::text[])", [keys]);
      await audit(owner.username, "login");
      return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie({ u: owner.username, o: true }) });
    }
  } else {
    const rows = await query(
      "SELECT id, username, pass_hash, disabled, token_version FROM users WHERE username_key = $1",
      [username.toLowerCase()]
    );
    const u = rows[0];
    const ok = await verifyPassword(password, u ? u.pass_hash : DUMMY_HASH);
    if (u && ok) {
      if (u.disabled) throw new HttpError(403, "This account is disabled. Ask an owner.");
      await query("DELETE FROM login_attempts WHERE key = ANY($1::text[])", [keys]);
      await query("UPDATE users SET last_login = now() WHERE id = $1", [u.id]);
      await audit(u.username, "login");
      return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie({ u: u.id, v: u.token_version }) });
    }
  }
  await recordFail(keys);
  throw new HttpError(401, "Wrong username or password");
}

async function me(req, res) {
  const user = await getSession(req);
  if (!user) throw new HttpError(401, "Not logged in");
  send(res, 200, {
    user: {
      id: user.id, username: user.username, display_name: user.display_name,
      role: user.role, owner: user.owner, perms: user.perms,
    },
    catalog: CATALOG,
  });
}

/* =========================================================
   My account
   ========================================================= */
async function updateAccount(req, res, user) {
  if (user.owner) throw new HttpError(400, "Owner accounts are set in the server settings");
  const body = await readJson(req, 4096);
  const name = str(body.display_name, 40, "Display name");
  await query("UPDATE users SET display_name = $1 WHERE id = $2", [name, user.id]);
  await audit(user.username, "account.rename", { display_name: name });
  send(res, 200, { ok: true });
}

async function changeOwnPassword(req, res, user) {
  if (user.owner) throw new HttpError(400, "Owner passwords are set in the server settings");
  const body = await readJson(req, 4096);
  const rows = await query("SELECT pass_hash, token_version FROM users WHERE id = $1", [user.id]);
  if (!(await verifyPassword(String(body.current || ""), rows[0].pass_hash))) {
    throw new HttpError(400, "Your current password is wrong");
  }
  const next = checkPassword(body.next);
  const v = rows[0].token_version + 1;
  await query("UPDATE users SET pass_hash = $1, token_version = $2 WHERE id = $3", [await hashPassword(next), v, user.id]);
  await audit(user.username, "account.password");
  // Keep this browser logged in, log out every other device.
  send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie({ u: user.id, v }) });
}

function checkPassword(pw) {
  if (typeof pw !== "string" || pw.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
  if (pw.length > 200) throw new HttpError(400, "Password is too long");
  return pw;
}

/* =========================================================
   Noticeboard
   ========================================================= */
function noticeFields(body, partial) {
  const out = {};
  if (!partial || "title" in body) out.title = str(body.title, 120, "Title");
  if (!partial || "body" in body) out.body = str(body.body, 4000, "Notice text");
  if ("frequency" in body) {
    if (!["always", "once"].includes(body.frequency)) throw new HttpError(400, "Bad frequency");
    out.frequency = body.frequency;
  }
  if ("pinned" in body) out.pinned = Boolean(body.pinned);
  if ("active" in body) out.active = Boolean(body.active);
  return out;
}

async function listNotices(res, user) {
  requirePerm(user, "notices.view");
  const rows = await query("SELECT * FROM notices ORDER BY pinned DESC, created_at DESC", []);
  send(res, 200, { notices: rows });
}

async function createNotice(req, res, user) {
  requirePerm(user, "notices.create");
  const f = noticeFields(await readJson(req, 64 * 1024), false);
  const rows = await query(
    `INSERT INTO notices (title, body, active, frequency, pinned, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING *`,
    [f.title, f.body, f.active ?? true, f.frequency || "always", f.pinned ?? false, user.username]
  );
  await audit(user.username, "notice.create", { id: rows[0].id, title: f.title });
  send(res, 201, { notice: rows[0] });
}

async function updateNotice(req, res, user, id) {
  const f = noticeFields(await readJson(req, 64 * 1024), true);
  const editing = ["title", "body", "frequency", "pinned"].some((k) => k in f);
  if (editing) requirePerm(user, "notices.edit");
  if ("active" in f) requirePerm(user, "notices.toggle");
  const keys = Object.keys(f);
  if (!keys.length) throw new HttpError(400, "Nothing to change");
  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  const params = keys.map((k) => f[k]);
  params.push(user.username, Number(id));
  const rows = await query(
    `UPDATE notices SET ${sets.join(", ")}, updated_by = $${params.length - 1}, updated_at = now()
     WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) throw new HttpError(404, "That notice no longer exists");
  await audit(user.username, "active" in f && !editing ? (f.active ? "notice.show" : "notice.hide") : "notice.edit", {
    id: rows[0].id, title: rows[0].title,
  });
  send(res, 200, { notice: rows[0] });
}

async function deleteNotice(res, user, id) {
  requirePerm(user, "notices.delete");
  const rows = await query("DELETE FROM notices WHERE id = $1 RETURNING id, title", [Number(id)]);
  if (!rows[0]) throw new HttpError(404, "That notice no longer exists");
  await audit(user.username, "notice.delete", rows[0]);
  send(res, 200, { ok: true });
}

/* =========================================================
   Site content (texts and images)
   ========================================================= */
async function listContent(res, user) {
  requirePerm(user, "content.view");
  const rows = await query("SELECT key, kind, value, updated_by, updated_at FROM content ORDER BY key", []);
  send(res, 200, { content: rows });
}

async function saveContent(req, res, user) {
  requirePerm(user, "content.view");
  const body = await readJson(req, 512 * 1024);
  const changes = body.changes && typeof body.changes === "object" ? Object.entries(body.changes) : [];
  if (!changes.length) throw new HttpError(400, "No changes to save");
  if (changes.length > 200) throw new HttpError(400, "Too many changes at once");

  const ops = [];
  for (const [key, change] of changes) {
    if (!KEY_RE.test(key)) throw new HttpError(400, `Bad key ${key}`);
    if (change === null) {
      requirePerm(user, "content.revert");
      ops.push({ key, del: true });
    } else if (change && change.kind === "html") {
      requirePerm(user, "content.edit_text");
      const v = sanitizeHtml(change.value);
      if (!v) throw new HttpError(400, `Text for ${key} can not be empty`);
      ops.push({ key, kind: "html", value: v });
    } else if (change && change.kind === "img") {
      requirePerm(user, "content.edit_images");
      if (!validImageSrc(change.value)) throw new HttpError(400, `Bad image for ${key}`);
      ops.push({ key, kind: "img", value: change.value });
    } else {
      throw new HttpError(400, `Bad change for ${key}`);
    }
  }

  for (const op of ops) {
    if (op.del) await query("DELETE FROM content WHERE key = $1", [op.key]);
    else {
      await query(
        `INSERT INTO content (key, kind, value, updated_by, updated_at) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (key) DO UPDATE SET kind = EXCLUDED.kind, value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [op.key, op.kind, op.value, user.username]
      );
    }
  }
  await audit(user.username, "content.save", {
    edited: ops.filter((o) => !o.del).map((o) => o.key),
    reverted: ops.filter((o) => o.del).map((o) => o.key),
  });
  const saved = {};
  for (const op of ops) saved[op.key] = op.del ? null : { k: op.kind, v: op.value };
  send(res, 200, { ok: true, saved });
}

async function uploadMedia(req, res, user) {
  requirePerm(user, "content.edit_images");
  const body = await readJson(req, 4.4 * 1024 * 1024);
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ""));
  if (!m) throw new HttpError(400, "Only PNG, JPG, GIF or WEBP images can be uploaded");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(413, "Images must be 3 MB or smaller");
  const magic = IMAGE_TYPES[m[1]];
  if (!magic.every((byte, i) => buf[i] === byte)) throw new HttpError(400, "That file is not a real image");
  const id = crypto.randomBytes(12).toString("hex");
  const name = typeof body.name === "string" ? body.name.slice(0, 120) : null;
  await query(
    "INSERT INTO media (id, mime, data, size, name, created_by) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, m[1], buf.toString("base64"), buf.length, name, user.username]
  );
  await audit(user.username, "media.upload", { id, name, size: buf.length });
  send(res, 201, { url: `/api/media/${id}` });
}

/* =========================================================
   Statistics
   ========================================================= */
async function getStats(res, user, q) {
  requirePerm(user, "stats.view");
  const days = Math.min(365, Math.max(1, parseInt(q.get("days") || "30", 10) || 30));
  const [todayRow] = await query(`SELECT to_char(${TODAY}, 'YYYY-MM-DD') AS d`, []);
  const rows = await query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS d, event, count FROM stats
     WHERE day > ${TODAY} - $1::int ORDER BY day`,
    [days]
  );
  const totals = await query("SELECT event, SUM(count)::int AS n FROM stats GROUP BY event", []);

  const dates = [];
  const end = new Date(`${todayRow.d}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i--) {
    dates.push(new Date(end.getTime() - i * 864e5).toISOString().slice(0, 10));
  }
  const index = new Map(dates.map((d, i) => [d, i]));
  const series = {};
  for (const e of TRACK_EVENTS) series[e] = new Array(days).fill(0);
  for (const r of rows) {
    const i = index.get(r.d);
    if (i !== undefined && series[r.event]) series[r.event][i] = Number(r.count);
  }
  const allTime = {};
  for (const e of TRACK_EVENTS) allTime[e] = 0;
  for (const t of totals) if (t.event in allTime) allTime[t.event] = Number(t.n);
  send(res, 200, { dates, series, allTime });
}

async function resetStats(res, user) {
  requirePerm(user, "stats.reset");
  await query("DELETE FROM stats", []);
  await audit(user.username, "stats.reset");
  send(res, 200, { ok: true });
}

/* =========================================================
   Team: users and roles
   ========================================================= */
function rankOf(role) {
  return RANK[role] || 0;
}

function publicUser(u, roles) {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name || u.username,
    role: u.role,
    overrides: u.overrides || {},
    disabled: u.disabled,
    created_by: u.created_by,
    created_at: u.created_at,
    last_login: u.last_login,
    perms: effectivePerms(u.role, roles[u.role], u.overrides),
  };
}

async function listUsers(res, user) {
  requirePerm(user, "users.view");
  const roles = await rolePerms();
  const rows = await query(
    `SELECT id, username, display_name, role, overrides, disabled, created_by, created_at, last_login
     FROM users ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, username_key`,
    []
  );
  send(res, 200, {
    owners: owners().map((o) => ({ username: o.username })),
    users: rows.map((u) => publicUser(u, roles)),
    roles,
    catalog: CATALOG,
  });
}

// Only perms the actor holds can be granted or taken away by them.
function assertCanChangePerms(actor, before, after) {
  if (actor.owner) return;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const p of keys) {
    if ((before[p] || null) !== (after[p] || null) && !actor.perms.includes(p)) {
      throw new HttpError(403, `You can not change "${p}" because you do not have it yourself`);
    }
  }
}

function assertOutranks(actor, role) {
  if (rankOf(actor.role) <= rankOf(role)) {
    throw new HttpError(403, "You can only manage roles below your own");
  }
}

async function createUser(req, res, actor) {
  requirePerm(actor, "users.create");
  const body = await readJson(req, 16 * 1024);
  const username = str(body.username, 24, "Username");
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(username)) {
    throw new HttpError(400, "Usernames use 3 to 24 letters, numbers, dots, dashes or underscores");
  }
  if (findOwner(username)) throw new HttpError(409, "That username is taken");
  const role = body.role;
  if (!EDITABLE_ROLES.includes(role)) throw new HttpError(400, "Pick Admin or Moderator");
  assertOutranks(actor, role);
  const password = checkPassword(body.password);
  const display = typeof body.display_name === "string" && body.display_name.trim()
    ? body.display_name.trim().slice(0, 40) : username;
  const overrides = cleanOverrides(body.overrides);
  if (Object.keys(overrides).length) {
    requirePerm(actor, "users.permissions");
    assertCanChangePerms(actor, {}, overrides);
  }
  let rows;
  try {
    rows = await query(
      `INSERT INTO users (username, username_key, display_name, role, pass_hash, overrides, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *`,
      [username, username.toLowerCase(), display, role, await hashPassword(password), JSON.stringify(overrides), actor.username]
    );
  } catch (e) {
    if (e && e.code === "23505") throw new HttpError(409, "That username is taken");
    throw e;
  }
  await audit(actor.username, "user.create", { username, role });
  send(res, 201, { user: publicUser(rows[0], await rolePerms()) });
}

async function loadTarget(actor, id) {
  const rows = await query("SELECT * FROM users WHERE id = $1", [Number(id)]);
  const t = rows[0];
  if (!t) throw new HttpError(404, "That account no longer exists");
  if (!actor.owner && actor.id === t.id) throw new HttpError(403, "Use My Account to change your own account");
  assertOutranks(actor, t.role);
  return t;
}

async function updateUser(req, res, actor, id) {
  const t = await loadTarget(actor, id);
  const body = await readJson(req, 16 * 1024);
  const sets = [];
  const params = [];
  const changed = {};
  let bump = false;
  const set = (col, val) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };

  if ("display_name" in body) {
    requirePerm(actor, "users.edit");
    set("display_name", str(body.display_name, 40, "Display name"));
    changed.display_name = true;
  }
  if ("role" in body && body.role !== t.role) {
    requirePerm(actor, "users.edit");
    if (!EDITABLE_ROLES.includes(body.role)) throw new HttpError(400, "Pick Admin or Moderator");
    assertOutranks(actor, body.role);
    set("role", body.role);
    changed.role = body.role;
  }
  if ("disabled" in body && Boolean(body.disabled) !== t.disabled) {
    requirePerm(actor, "users.edit");
    set("disabled", Boolean(body.disabled));
    changed.disabled = Boolean(body.disabled);
    if (body.disabled) bump = true;
  }
  if ("overrides" in body) {
    requirePerm(actor, "users.permissions");
    const next = cleanOverrides(body.overrides);
    assertCanChangePerms(actor, t.overrides || {}, next);
    params.push(JSON.stringify(next));
    sets.push(`overrides = $${params.length}::jsonb`);
    changed.overrides = next;
  }
  if ("password" in body) {
    requirePerm(actor, "users.reset_password");
    set("pass_hash", await hashPassword(checkPassword(body.password)));
    changed.password = true;
    bump = true;
  }
  if (!sets.length) throw new HttpError(400, "Nothing to change");
  if (bump) sets.push("token_version = token_version + 1");
  params.push(t.id);
  const rows = await query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
  await audit(actor.username, "user.update", { username: t.username, ...changed });
  send(res, 200, { user: publicUser(rows[0], await rolePerms()) });
}

async function deleteUser(res, actor, id) {
  requirePerm(actor, "users.delete");
  const t = await loadTarget(actor, id);
  await query("DELETE FROM users WHERE id = $1", [t.id]);
  await audit(actor.username, "user.delete", { username: t.username, role: t.role });
  send(res, 200, { ok: true });
}

async function updateRole(req, res, actor, role) {
  requirePerm(actor, "roles.edit");
  if (!EDITABLE_ROLES.includes(role)) throw new HttpError(400, "That role can not be changed");
  assertOutranks(actor, role);
  const body = await readJson(req, 16 * 1024);
  const next = cleanPermList(body.perms);
  const current = (await rolePerms())[role];
  const asMap = (list) => Object.fromEntries(list.map((p) => [p, "allow"]));
  assertCanChangePerms(actor, asMap(current), asMap(next));
  await query(
    `INSERT INTO role_perms (role, perms, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (role) DO UPDATE SET perms = EXCLUDED.perms, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [role, JSON.stringify(next), actor.username]
  );
  await audit(actor.username, "role.update", {
    role,
    added: next.filter((p) => !current.includes(p)),
    removed: current.filter((p) => !next.includes(p)),
  });
  send(res, 200, { role, perms: next });
}

/* =========================================================
   Activity log
   ========================================================= */
async function listAudit(res, user, q) {
  requirePerm(user, "logs.view");
  const limit = Math.min(200, Math.max(1, parseInt(q.get("limit") || "100", 10) || 100));
  const before = parseInt(q.get("before") || "0", 10) || 0;
  const rows = before
    ? await query("SELECT * FROM audit WHERE id < $1 ORDER BY id DESC LIMIT $2", [before, limit])
    : await query("SELECT * FROM audit ORDER BY id DESC LIMIT $1", [limit]);
  send(res, 200, { entries: rows });
}

