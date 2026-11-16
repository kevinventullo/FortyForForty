# Forty for Forty

Simple skateboarding trick lists for Andrew, Kevin, and Erik.
Plain HTML, CSS, and JavaScript. No dependencies, accounts, database, or build step.

## Run locally

From this folder:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Visit **http://localhost:8000**. Stop the server with Ctrl+C.
Use the local server instead of double-clicking HTML files: browsers need HTTP to load the trick data and JavaScript modules.

- `index.html` — three links to the individual lists
- `andrew.html`, `kevin.html`, `erik.html` — individual trick lists
- `data/andrew.txt`, `data/kevin.txt`, `data/erik.txt` — the editable trick lists

## Add or correct tricks

Open the person's file in `data/` on GitHub and click the pencil (Edit). Each file has two sections:

```text
[Landed]
Half cab flip | 2026-11-14
Fakie flip | 2026-11-14

[Not Yet Done]
Nollie 360 Flip
```

- Under **[Landed]**, use **Trick name | YYYY-MM-DD**, one trick per line. Use a four-digit year and two-digit month and day.
- Under **[Not Yet Done]**, write only the trick name, one per line. These rows appear in gray, without dates, below the landed tricks.
- When a trick is landed, **move** its line from `[Not Yet Done]` to `[Landed]` and append its date after a `|`. Remove the old unfinished entry so it doesn't appear twice.
- Landed tricks display newest first. Unfinished tricks keep their order from the file.
- Keep one entry per trick. Repeated entries appear as separate rows.
- Blank lines and lines starting with `#` are ignored. Keep the section headings on their own lines.
- Names are plain text; apostrophes, commas, and ampersands are fine. The `|` character separates dates and names, so don't use it in unfinished names.
- Correct a name or date directly, or delete a line to remove it.
- Empty sections are fine. A file with no entries displays “No tricks yet,” as Erik's does initially.
- Keep all three files, even if one has no entries.

Click **Commit changes** to save to the branch used for Pages (normally `main`).
If you create a pull request, merge it into that branch before expecting a site update.
Once Pages is enabled, GitHub publishes the change automatically; allow a few minutes, then reload the page. Open pages do not update in real time.

An invalid line or impossible date shows a load error for that person's list instead of silently dropping an achievement. Fix the line, commit, and reload. The browser console includes the file and line number.

**The root `tricklist.txt` is the original import for reference. Edit the files in `data/` from now on.**

## Host on GitHub Pages when ready

This site is configured for GitHub Pages using the `main` branch and the repository root.

- Website: https://kevinventullo.github.io/FortyForForty/
- Repository: https://github.com/kevinventullo/FortyForForty

To set up the same site in another repository:

1. Create a GitHub repository, such as `FortyForForty`, and push or upload this folder's contents.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Select **main** and **/(root)**, then save.
5. Wait for deployment. GitHub will show the live address, usually `https://YOUR-USERNAME.github.io/FortyForForty/`.

Use a public repository for Pages on GitHub Free. The included `.nojekyll` file serves this static site without Jekyll. All links and data requests are relative, so both repository URLs and custom domains work.

The GitHub web editor commits data updates to the same source branch, which triggers publication automatically. No manual build or separate generated files are needed.

[GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Optional developer checks

With Node.js 20 or later:

```sh
node --test tests/data.test.mjs
node --check assets/app.mjs
```

The tests cover section editing, moving unfinished tricks to landed, date validation, sorting, time-zone-safe dates, and preservation of the initial imported tricks. No npm install is needed.
