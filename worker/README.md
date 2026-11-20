# Editor backend

The Cloudflare Worker verifies editing passwords and updates `data/<person>.txt` through GitHub. Each session is restricted to one person. The GitHub credential and password hashes are Cloudflare secrets.

## Deploy

```sh
npm exec --yes --package=node@22 --package=wrangler@4.165.0 -- wrangler login
npm exec --yes --package=node@22 --package=wrangler@4.165.0 -- wrangler deploy --config worker/wrangler.jsonc
node worker/setup.mjs --api=https://YOUR-WORKER.workers.dev
```

Open the local URL printed by setup. Copy the generated editing passwords and supply a fine-grained GitHub token restricted to this repository, with **Contents: Read and write**. Setup sends secrets directly to Cloudflare; it does not write them to files. Keep the token's expiration date so it can be renewed before editing stops.

Set `EDITOR_API` in `assets/editor-config.mjs` to the deployed Worker URL, without a trailing slash, after setup succeeds. Commit and push the site changes. A blank URL keeps the Edit links hidden.

## Reset one password

```sh
node worker/setup.mjs --api=https://YOUR-WORKER.workers.dev --reset=<person>
```

Copy the new password from the local setup page and click Configure editing. This invalidates that person's existing sessions. Other passwords remain unchanged.

To replace only the GitHub token, use `--token-only`.

## Behavior

- Passwords are generated from 18 random bytes. Their SHA-256 hashes are secret bindings; do not replace them with hashes of short, chosen passwords.
- Sessions expire after eight hours and are kept in the browser tab's session storage. Logging out clears the browser's session.
- Login limits are enforced by Cloudflare bindings per IP and per person. These limits apply per Cloudflare location.
- All saves include the original file revision. Conflicting edits return an error and retain the browser's unsaved changes.
- The form edits names, status, and dates. Existing video filenames are preserved; video upload continues through GitHub.
- Public pages update after GitHub Pages republishes.
- Add permitted people to `EDITORS` in `wrangler.jsonc` and configure their password hashes when adding new site pages.
- Secrets: `GITHUB_TOKEN`, `SESSION_SECRET`, and `PASSWORD_HASH_<PERSON>`. None belong in the public repository.

## Checks

```sh
node --test tests/data.test.mjs tests/editor.test.mjs tests/setup.test.mjs
```
