// Small helpers shared by every API route.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function send(res, status, data, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (data === undefined || data === null) {
    res.end();
    return;
  }
  if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!res.getHeader("Cache-Control")) res.setHeader("Cache-Control", "no-store");
  res.end(typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data));
}

// Works both on Vercel (which may pre-parse req.body) and on a plain Node server.
export async function readJson(req, limit = 1024 * 1024) {
  let body = req.body;
  if (body === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new HttpError(413, "That upload is too big");
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString("utf8");
  }
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  if (typeof body === "string") {
    if (body.length > limit) throw new HttpError(413, "That upload is too big");
    if (!body.trim()) return {};
    try {
      return JSON.parse(body);
    } catch {
      throw new HttpError(400, "Bad request body");
    }
  }
  return body && typeof body === "object" ? body : {};
}

export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

// Blocks writes coming from other websites. The admin panel and the
// public site always call the API on their own host.
export function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return; // non-browser clients and same-origin GETs
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Bad origin");
  }
  if (originHost !== host) throw new HttpError(403, "Bad origin");
}

export function str(v, max, field) {
  if (typeof v !== "string") throw new HttpError(400, `${field} is missing`);
  const s = v.trim();
  if (!s) throw new HttpError(400, `${field} can not be empty`);
  if (s.length > max) throw new HttpError(400, `${field} is too long (max ${max})`);
  return s;
}
