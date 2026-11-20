import test from "node:test";
import assert from "node:assert/strict";
import { verifyLogins } from "../worker/setup-check.mjs";

test("setup retries credentials while a deployment propagates, then verifies the list", async () => {
  const delays = [];
  const calls = [];
  const responses = [
    new Response("old deployment", { status: 401 }),
    Response.json({ token: "test-only-token" }),
    new Response("wait", { status: 429, headers: { "Retry-After": "60" } }),
    Response.json({ tricks: [] }),
  ];
  await verifyLogins({
    api: "https://worker.example", origin: "https://site.example", passwords: { andrew: "test-only-password" },
    sleep: async ms => delays.push(ms),
    fetchImpl: async (url, options) => { calls.push({ url, options }); return responses.shift(); },
  });
  assert.deepEqual(delays, [2000, 60000]);
  assert.equal(calls[0].url, "https://worker.example/login");
  assert.equal(calls[2].url, "https://worker.example/lists/andrew");
  assert.equal(calls[2].options.headers.Authorization, "Bearer test-only-token");
});

test("setup reports an actionable status without revealing a password", async () => {
  const secret = "test-only-password";
  await assert.rejects(() => verifyLogins({
    api: "https://worker.example", origin: "https://site.example", passwords: { andrew: secret },
    sleep: async () => {}, fetchImpl: async () => new Response("denied", { status: 403 }),
  }), error => error.message.includes("HTTP 403") && !error.message.includes(secret));
});
