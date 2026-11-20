import { parseTricks } from "../assets/data.mjs";
import { checkPassword, createSession, verifySession, storedHash } from "./auth.mjs";
import { validateTricks, serializeTricks } from "./list.mjs";

const encoder = new TextEncoder();
const MAX_BODY = 128 * 1024;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

async function body(request, limit = MAX_BODY) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "Use JSON.");
  if (Number(request.headers.get("content-length")) > limit) throw new HttpError(413, "This request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request.");
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, "This request is too large."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new HttpError(400, "Invalid request."); }
}

async function limit(binding, key) {
  if (!binding || typeof binding.limit !== "function") throw new HttpError(503, "Editing is temporarily unavailable.");
  if (!(await binding.limit({ key })).success) throw new HttpError(429, "Too many attempts. Wait a minute and try again.");
}

function base64(text) {
  const bytes = encoder.encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

function fromBase64(text) {
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(text.replace(/\s/g, "")), c => c.charCodeAt(0)));
}

export function createHandler({ fetchImpl = (...args) => globalThis.fetch(...args), now = Date.now } = {}) {
  return async function handle(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = Array.isArray(env.ALLOWED_ORIGINS) && env.ALLOWED_ORIGINS.includes(origin);
    const url = new URL(request.url);
    let response;
    try {
      if (url.pathname === "/health" && request.method === "GET") {
        const ready = Boolean(env.GITHUB_TOKEN && env.SESSION_SECRET && env.EDITORS?.some(person => storedHash(env, person)));
        response = json({ ready }, ready ? 200 : 503);
      } else {
        if (!allowed) throw new HttpError(403, "This origin is not allowed.");
        if (request.method === "OPTIONS") {
          response = new Response(null, { status: 204 });
        } else {
          if (!env.GITHUB_TOKEN || !env.SESSION_SECRET) throw new HttpError(503, "Editing is not configured.");
          const ip = request.headers.get("CF-Connecting-IP") || "unknown";
          if (url.pathname === "/login" && request.method === "POST") {
            await limit(env.LOGIN_IP_LIMIT, "forty:login:" + ip);
            const input = await body(request, 2048);
            if (typeof input.person !== "string" || !/^[a-z0-9_-]{1,40}$/.test(input.person) || typeof input.password !== "string" || input.password.length > 256) throw new HttpError(400, "Enter your password.");
            await limit(env.LOGIN_PERSON_LIMIT, "forty:login:" + input.person);
            if (!await checkPassword(env, input.person, input.password)) throw new HttpError(401, "Incorrect password.");
            response = json(await createSession(env, input.person, now()));
          } else {
            const match = /^\/lists\/([a-z0-9_-]{1,40})$/.exec(url.pathname);
            if (!match || !["GET", "PUT"].includes(request.method)) throw new HttpError(404, "Not found.");
            const person = match[1];
            const authorization = request.headers.get("Authorization") || "";
            const authenticated = await verifySession(env, authorization.startsWith("Bearer ") ? authorization.slice(7) : "", now());
            if (!authenticated) throw new HttpError(401, "Your session expired. Sign in again.");
            if (authenticated !== person) throw new HttpError(403, "You can only edit your own list.");
            await limit(env.EDITOR_LIMIT, "forty:editor:" + person);
            const githubURL = "https://api.github.com/repos/" + encodeURIComponent(env.GITHUB_OWNER) + "/" + encodeURIComponent(env.GITHUB_REPO) + "/contents/data/" + person + ".txt";
            const headers = { Accept: "application/vnd.github+json", Authorization: "Bearer " + env.GITHUB_TOKEN, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "FortyForForty-editor" };
            if (request.method === "GET") {
              const upstream = await fetchImpl(githubURL + "?ref=" + encodeURIComponent(env.GITHUB_BRANCH), { headers, redirect: "manual" });
              if (!upstream.ok) throw new HttpError(503, "Couldn't load the list. Try again or contact the site owner.");
              const file = await upstream.json();
              if (file.type !== "file" || file.encoding !== "base64" || file.size > MAX_BODY || typeof file.content !== "string") throw new HttpError(422, "The saved file needs to be checked by the site owner.");
              let tricks;
              try { tricks = parseTricks(fromBase64(file.content)); }
              catch { throw new HttpError(422, "The saved file needs to be checked by the site owner."); }
              response = json({ sha: file.sha, tricks });
            } else {
              const input = await body(request);
              if (typeof input.sha !== "string" || !/^[a-f0-9]{40,64}$/.test(input.sha)) throw new HttpError(400, "Reload the list before saving.");
              let tricks;
              try { tricks = validateTricks(input.tricks); }
              catch (error) { throw new HttpError(422, error.message); }
              const upstream = await fetchImpl(githubURL, {
                method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, redirect: "manual",
                body: JSON.stringify({ message: "Update " + person + "'s trick list", branch: env.GITHUB_BRANCH, sha: input.sha, content: base64(serializeTricks(tricks)) }),
              });
              if ([409, 422].includes(upstream.status)) throw new HttpError(409, "This list changed since you opened it. Reload the latest list before saving.");
              if (!upstream.ok) throw new HttpError(503, "Couldn't save the list. Your changes are still here; try again or contact the site owner.");
              const saved = await upstream.json();
              response = json({ sha: saved.content.sha, tricks });
            }
          }
        }
      }
    } catch (error) {
      response = json({ error: error instanceof HttpError ? error.message : "Editing is temporarily unavailable. Try again." }, error instanceof HttpError ? error.status : 503);
    }
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Vary", "Origin");
    if (allowed) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      response.headers.set("Access-Control-Max-Age", "600");
    }
    if (response.status === 429) response.headers.set("Retry-After", "60");
    return response;
  };
}

export default { fetch: createHandler() };
