// Edited website text may only contain a few safe formatting tags.
// Everything else (scripts, links, attributes, styles) is removed.
const ALLOWED = new Set(["b", "strong", "i", "em", "br"]);

export function sanitizeHtml(input, max = 5000) {
  let s = String(input ?? "");
  if (s.length > max * 2) s = s.slice(0, max * 2);
  const out = [];
  const parts = s.split(/(<[^>]*>)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("<") && part.endsWith(">")) {
      const m = /^<\s*(\/?)\s*([a-z0-9]+)[^>]*?>$/i.exec(part);
      if (m && ALLOWED.has(m[2].toLowerCase())) {
        const tag = m[2].toLowerCase();
        out.push(tag === "br" ? "<br>" : `<${m[1]}${tag}>`);
      }
      continue;
    }
    // Text: keep existing entities, escape any stray angle brackets.
    out.push(part.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  }
  const html = out.join("").replace(/\s+/g, " ").trim();
  return html.length > max ? html.slice(0, max) : html;
}

const MEDIA_SRC = /^\/api\/media\/[a-f0-9]{24}$/;
const ASSET_SRC = /^assets\/img\/[A-Za-z0-9_.-]+\.(png|jpe?g|webp|gif)$/;

export function validImageSrc(v) {
  return typeof v === "string" && (MEDIA_SRC.test(v) || ASSET_SRC.test(v));
}

export const KEY_RE = /^[a-z0-9_.-]{1,64}$/i;
