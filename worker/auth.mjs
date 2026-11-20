const encoder = new TextEncoder();

export async function passwordHash(password) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(password));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

// Setup generates 144-bit random passwords; these hashes are private Worker secrets.
export function storedHash(env, person) {
  if (!Array.isArray(env.EDITORS) || !env.EDITORS.includes(person)) return null;
  const hash = env["PASSWORD_HASH_" + person.toUpperCase()];
  return typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function checkPassword(env, person, password) {
  const expected = storedHash(env, person);
  const actual = await passwordHash(password);
  return equal(actual, expected || "0".repeat(64)) && expected !== null;
}

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error("Invalid token.");
  return Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
}

async function sessionKey(env) {
  if (typeof env.SESSION_SECRET !== "string" || env.SESSION_SECRET.length < 32) throw new Error("Session secret missing.");
  return crypto.subtle.importKey("raw", encoder.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSession(env, person, now = Date.now()) {
  const hash = storedHash(env, person);
  if (!hash) throw new Error("Password missing.");
  const expiresAt = Math.floor(now / 1000) + 8 * 60 * 60;
  const payload = encode(encoder.encode(JSON.stringify({ sub: person, exp: expiresAt, version: await passwordHash(hash) })));
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(env), encoder.encode(payload));
  return { token: payload + "." + encode(new Uint8Array(signature)), expiresAt };
}

export async function verifySession(env, token, now = Date.now()) {
  try {
    if (typeof token !== "string" || token.length > 2048) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    if (!await crypto.subtle.verify("HMAC", await sessionKey(env), decode(signature), encoder.encode(payload))) return null;
    const claims = JSON.parse(new TextDecoder().decode(decode(payload)));
    const hash = storedHash(env, claims.sub);
    if (!hash || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(now / 1000)) return null;
    if (!equal(claims.version, await passwordHash(hash))) return null;
    return claims.sub;
  } catch {
    return null;
  }
}
