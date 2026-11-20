import { verifyLogins } from "./setup-check.mjs";
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(await readFile(new URL("./wrangler.jsonc", import.meta.url), "utf8"));
const args = process.argv.slice(2);
const reset = args.find(value => value.startsWith("--reset="))?.slice(8);
const tokenOnly = args.includes("--token-only");
const api = args.find(value => value.startsWith("--api="))?.slice(6);
if (!api || !/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(api)) throw new Error("Pass --api=https://your-worker.workers.dev");
if (reset && !config.vars.EDITORS.includes(reset)) throw new Error("Unknown person.");
const people = tokenOnly ? [] : reset ? [reset] : config.vars.EDITORS;
const passwords = Object.fromEntries(people.map(person => [person, randomBytes(18).toString("base64url")]));
const sessionSecret = randomBytes(32).toString("hex");
const csrf = randomBytes(32).toString("hex");
const nonce = randomBytes(16).toString("base64");
const origin = "http://127.0.0.1:8799";
const tokenURL = "https://github.com/settings/personal-access-tokens/new?name=FortyForForty+editor&target_name=" + encodeURIComponent(config.vars.GITHUB_OWNER) + "&contents=write&expires_in=365";
let busy = false;
let done = false;
let writtenSecrets = "";

function page() {
  const passwordFields = people.map(person => '<label>' + person + '<input class="password" readonly value="' + passwords[person] + '" aria-label="' + person + ' editing password"></label>').join("");
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Editor setup</title><style>body{font:16px/1.6 Arial;background:#17232f;color:#e4e8ec;max-width:640px;margin:40px auto;padding:0 24px}a{color:#a9cce5}label{display:block;margin:14px 0}input{box-sizing:border-box;display:block;width:100%;padding:10px;background:#263e50;color:#fff;border:1px solid #405568;font:inherit}button{font:inherit;padding:10px;margin:16px 0;background:#263e50;color:#fff;border:1px solid #405568}h1{font-size:22px}p{color:#bbc7d0}</style><h1>Editor setup</h1>' +
    (people.length ? '<p>Copy these editing passwords and share each one with its owner. They are not saved on this computer.</p>' + passwordFields : "") +
    '<form id="setup">' + (!reset ? '<p><a href="' + tokenURL.replaceAll("&", "&amp;") + '" target="_blank" rel="noopener">Create a GitHub token</a>. Select <b>Only select repositories → FortyForForty</b> and <b>Contents: Read and write</b>.</p><label>GitHub token<input id="token" type="password" autocomplete="off" required></label>' : "") +
    '<button type="submit">Configure editing</button></form><p id="status" role="status"></p><script nonce="' + nonce + '">document.querySelectorAll(".password").forEach(input=>input.addEventListener("click",()=>input.select()));document.querySelector("#setup").addEventListener("submit",async event=>{event.preventDefault();const button=document.querySelector("button");button.disabled=true;const status=document.querySelector("#status");status.textContent="Configuring…";try{const response=await fetch("/configure",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({csrf:' + JSON.stringify(csrf) + ',token:document.querySelector("#token")?.value||""})});const result=await response.json();status.textContent=result.message;if(response.ok){const token=document.querySelector("#token");if(token)token.value="";}else button.disabled=false;}catch{status.textContent="Could not configure. Try again.";button.disabled=false;}});</script></html>';
}

function wranglerSecrets(secrets) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["exec", "--yes", "--package=node@22", "--package=wrangler@4.165.0", "--", "wrangler", "secret", "bulk", "--config", "worker/wrangler.jsonc"], { cwd: root, stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error("Cloudflare configuration failed. Check the Cloudflare login and try again.")));
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(secrets));
  });
}

async function configure(token) {
  const secrets = {};
  if (!reset) {
    if (!/^github_pat_[A-Za-z0-9_]+$/.test(token)) throw new Error("Enter a fine-grained GitHub token beginning with github_pat_.");
    const response = await fetch("https://api.github.com/repos/" + config.vars.GITHUB_OWNER + "/" + config.vars.GITHUB_REPO + "/contents/data/" + config.vars.EDITORS[0] + ".txt", { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "FortyForForty-setup" }, redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("The token cannot read this repository. Check its repository selection and Contents permission.");
    secrets.GITHUB_TOKEN = token;
  }
  if (!reset && !tokenOnly) secrets.SESSION_SECRET = sessionSecret;
  for (const person of people) secrets["PASSWORD_HASH_" + person.toUpperCase()] = createHash("sha256").update(passwords[person]).digest("hex");
  const fingerprint = createHash("sha256").update(JSON.stringify(secrets)).digest("hex");
  if (fingerprint !== writtenSecrets) {
    await wranglerSecrets(secrets);
    writtenSecrets = fingerprint;
  }
  await verifyLogins({ api, origin: config.vars.ALLOWED_ORIGINS[0], passwords });
}

const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'");
  if (request.headers.host !== "127.0.0.1:8799") { response.writeHead(403).end(); return; }
  if (request.method === "GET" && request.url === "/") { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(page()); return; }
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/configure" || request.headers.origin !== origin || request.headers["content-type"] !== "application/json") { response.writeHead(403).end(JSON.stringify({ message: "Not allowed." })); return; }
  let acquired = false;
  try {
    let text = "";
    for await (const chunk of request) { text += chunk; if (text.length > 4096) throw new Error("Request too large."); }
    const input = JSON.parse(text);
    if (input.csrf !== csrf) throw new Error("Reload the setup page.");
    if (done) { response.end(JSON.stringify({ message: "Editing is configured. Copy the passwords before closing this page." })); return; }
    if (busy) throw new Error("Configuration is already running.");
    busy = true;
    acquired = true;
    await configure(String(input.token || "").trim());
    done = true;
    console.log("Credentials configured; login and list-read checks passed. No passwords or tokens were logged.");
    response.end(JSON.stringify({ message: "Editing is configured. Copy the passwords before closing this page." }));
  } catch (error) {
    response.writeHead(400).end(JSON.stringify({ message: error.message?.startsWith("Cloudflare") || error.message?.startsWith("The token") || error.message?.startsWith("Enter a") || error.message?.startsWith("Credentials") ? error.message : "Could not configure. Check the input and try again." }));
  } finally { if (acquired) busy = false; }
});
server.listen(8799, "127.0.0.1", () => console.log("Open " + origin + " to configure editing. Credentials stay in memory and are sent to Cloudflare through stdin."));
