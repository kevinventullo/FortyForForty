import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createHandler } from "../worker/index.mjs";
import { passwordHash, createSession, verifySession } from "../worker/auth.mjs";
import { serializeTricks, validateTricks } from "../worker/list.mjs";
import { parseTricks } from "../assets/data.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const ORIGIN = "https://example.github.io";
const NOW = 1800000000000;
const SHA = "a".repeat(40);
const allow = { limit: async () => ({ success: true }) };
async function env() {
  return {
    EDITORS: ["andrew", "kevin"], ALLOWED_ORIGINS: [ORIGIN],
    PASSWORD_HASH_ANDREW: await passwordHash("test-only-andrew-password"), PASSWORD_HASH_KEVIN: await passwordHash("test-only-kevin-password"),
    SESSION_SECRET: "test-only-session-secret-32-characters", GITHUB_TOKEN: "test-only-github-token",
    GITHUB_OWNER: "owner", GITHUB_REPO: "repo", GITHUB_BRANCH: "main",
    LOGIN_IP_LIMIT: allow, LOGIN_PERSON_LIMIT: allow, EDITOR_LIMIT: allow,
  };
}
function request(path, { method = "GET", token, data, origin = ORIGIN } = {}) {
  return new Request("https://editor.example" + path, { method, headers: { ...(origin ? { Origin: origin } : {}), ...(token ? { Authorization: "Bearer " + token } : {}), ...(data !== undefined ? { "Content-Type": "application/json" } : {}), "CF-Connecting-IP": "192.0.2.1" }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
}
const githubFile = text => new Response(JSON.stringify({ type: "file", encoding: "base64", size: Buffer.byteLength(text), content: Buffer.from(text).toString("base64"), sha: SHA }), { headers: { "Content-Type": "application/json" } });
function handler(fetchImpl = () => { throw new Error("Unexpected GitHub request."); }) { return createHandler({ fetchImpl, now: () => NOW }); }

test("login checks the password and creates a person-scoped session", async () => {
  const e = await env();
  const handle = handler();
  assert.equal((await handle(request("/login", { method: "POST", data: { person: "andrew", password: "wrong" } }), e)).status, 401);
  const response = await handle(request("/login", { method: "POST", data: { person: "andrew", password: "test-only-andrew-password" } }), e);
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.equal(await verifySession(e, session.token, NOW), "andrew");
  assert.equal(await verifySession(e, session.token, NOW + 8 * 60 * 60 * 1000), null);
  assert.equal(await verifySession(e, session.token.slice(0, -8) + "AAAAAAAA", NOW), null);
  e.PASSWORD_HASH_ANDREW = await passwordHash("replacement-test-password");
  assert.equal(await verifySession(e, session.token, NOW), null);
});

test("requests require an allowed origin and authentication", async () => {
  const e = await env();
  const handle = handler();
  assert.equal((await handle(request("/lists/andrew"), e)).status, 401);
  assert.equal((await handle(request("/lists/andrew", { method: "PUT", data: {} }), e)).status, 401);
  assert.equal((await handle(request("/login", { method: "POST", origin: "https://attacker.example", data: {} }), e)).status, 403);
  assert.equal((await handle(request("/login", { method: "POST", origin: null, data: {} }), e)).status, 403);
  const options = await handle(request("/lists/andrew", { method: "OPTIONS" }), e);
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(options.headers.get("cache-control"), "no-store");
});

test("a session cannot read or change another person's file or arbitrary paths", async () => {
  const e = await env();
  const { token } = await createSession(e, "andrew", NOW);
  for (const method of ["GET", "PUT"]) {
    assert.equal((await handler()(request("/lists/kevin", { method, token, ...(method === "PUT" ? { data: { sha: SHA, tricks: [] } } : {}) }), e)).status, 403);
  }
  assert.equal((await handler()(request("/lists/%2E%2E%2FREADME.md", { token }), e)).status, 404);
});

test("rate limits run before password checks, and missing bindings fail closed", async () => {
  const e = await env();
  e.LOGIN_IP_LIMIT = { limit: async () => ({ success: false }) };
  const denied = await handler()(request("/login", { method: "POST", data: { person: "andrew", password: "test-only-andrew-password" } }), e);
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get("retry-after"), "60");
  delete e.LOGIN_IP_LIMIT;
  assert.equal((await handler()(request("/login", { method: "POST", data: {} }), e)).status, 503);
});

test("list reads use GitHub's current file and return its revision", async () => {
  const e = await env();
  const { token } = await createSession(e, "andrew", NOW);
  const handle = handler(async (url, options) => {
    assert.equal(url, "https://api.github.com/repos/owner/repo/contents/data/andrew.txt?ref=main");
    assert.equal(options.headers.Authorization, "Bearer test-only-github-token");
    assert.equal(options.redirect, "manual");
    return githubFile("[Landed]\nHalf cab flip | 2026-11-14 | half-cab.mp4\n[Not Yet Done]\nNollie 360 Flip\n");
  });
  const response = await handle(request("/lists/andrew", { token }), e);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.sha, SHA);
  assert.equal(result.tricks[0].video, "half-cab.mp4");
  assert.equal(result.tricks[1].date, null);
});

test("saving validates entries and uses the caller's revision without overwriting concurrent edits", async () => {
  const e = await env();
  const { token } = await createSession(e, "andrew", NOW);
  const tricks = [{ name: "Café flip", date: "2026-11-14", video: "clip.mp4" }, { name: "Nollie flip", date: null }];
  const handle = handler(async (url, options) => {
    assert.equal(url, "https://api.github.com/repos/owner/repo/contents/data/andrew.txt");
    assert.equal(options.redirect, "manual");
    const payload = JSON.parse(options.body);
    assert.equal(payload.sha, SHA);
    assert.equal(payload.branch, "main");
    assert.deepEqual(parseTricks(Buffer.from(payload.content, "base64").toString("utf8")), tricks);
    return new Response(JSON.stringify({ content: { sha: "b".repeat(40) } }), { status: 200 });
  });
  const response = await handle(request("/lists/andrew", { method: "PUT", token, data: { sha: SHA, tricks, path: "README.md" } }), e);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sha, "b".repeat(40));
  const conflict = await handler(async () => new Response("conflict", { status: 409 }))(request("/lists/andrew", { method: "PUT", token, data: { sha: SHA, tricks } }), e);
  assert.equal(conflict.status, 409);
});

test("invalid content cannot be serialized into section headings or extra lines", async () => {
  for (const trick of [
    { name: "# comment", date: null }, { name: "[Landed]", date: null },
    { name: "Flip\nKickflip", date: null }, { name: "Flip | other", date: null },
    { name: "", date: null }, { name: "Flip", date: "2026-02-29" },
    { name: "Flip", date: null, video: "clip.mp4" }, { name: "Flip", date: "2026-11-14", video: "../clip.mp4" },
  ]) assert.throws(() => validateTricks([trick]));
  assert.deepEqual(parseTricks(serializeTricks([])), []);
  assert.throws(() => validateTricks(Array(501).fill({ name: "Flip", date: null })));
  const e = await env();
  const { token } = await createSession(e, "andrew", NOW);
  const response = await handler()(request("/lists/andrew", { method: "PUT", token, data: { sha: SHA, tricks: [{ name: "", date: null }] } }), e);
  assert.equal(response.status, 422);
});

test("oversized requests, missing setup, and GitHub failures do not expose credentials", async () => {
  const e = await env();
  assert.equal((await handler()(request("/login", { method: "POST", data: { person: "andrew", password: "x".repeat(5000) } }), e)).status, 413);
  assert.equal((await handler()(request("/health", { origin: null }), {})).status, 503);
  const { token } = await createSession(e, "andrew", NOW);
  const response = await handler(async () => new Response("upstream " + e.GITHUB_TOKEN, { status: 401 }))(request("/lists/andrew", { token }), e);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes(e.GITHUB_TOKEN));
});

test("the default GitHub fetch retains the runtime's global receiver", async () => {
  const e = await env();
  const { token } = await createSession(e, "andrew", NOW);
  const original = globalThis.fetch;
  globalThis.fetch = function () {
    assert.equal(this, globalThis);
    return Promise.resolve(githubFile("[Landed]\nKickflip | 2026-11-14\n"));
  };
  try {
    const response = await createHandler({ now: () => NOW })(request("/lists/andrew", { token }), e);
    assert.equal(response.status, 200);
  } finally { globalThis.fetch = original; }
});

// Workers only supports follow/manual. Redirects must not forward the credential.
test("GitHub redirects fail closed for both reads and saves", async () => {
  const e = await env();
  const { token } = await createSession(e, "andrew", NOW);
  for (const method of ["GET", "PUT"]) {
    const handle = handler(async (url, options) => {
      assert.equal(options.redirect, "manual");
      return new Response(null, { status: 302, headers: { Location: "https://example.com" } });
    });
    const response = await handle(request("/lists/andrew", { method, token, ...(method === "PUT" ? { data: { sha: SHA, tricks: [] } } : {}) }), e);
    assert.equal(response.status, 503);
  }
});
