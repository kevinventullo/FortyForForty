export async function verifyLogins({ api, origin, passwords, fetchImpl = (...args) => globalThis.fetch(...args), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  async function request(path, options) {
    for (let attempt = 0; ; attempt++) {
      const response = await fetchImpl(api + path, { ...options, signal: AbortSignal.timeout(15000) });
      if (response.ok || ![401, 429, 503].includes(response.status) || attempt === 3) return response;
      const retryAfter = Number(response.headers.get("Retry-After"));
      await response.arrayBuffer();
      await sleep(response.status === 429 ? Math.min(60, Math.max(1, retryAfter || 60)) * 1000 : 2000 * 2 ** attempt);
    }
  }
  for (const [person, password] of Object.entries(passwords)) {
    const login = await request("/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ person, password }) });
    if (!login.ok) throw new Error("Credentials were saved, but login verification failed (HTTP " + login.status + "). Try Configure editing again.");
    const session = await login.json();
    const list = await request("/lists/" + person, { headers: { Origin: origin, Authorization: "Bearer " + session.token } });
    if (!list.ok) throw new Error("Credentials were saved, but the list could not be loaded (HTTP " + list.status + "). Check the GitHub token.");
  }
}
