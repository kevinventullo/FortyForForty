# Forty for Forty

Skateboarding trick lists.
Plain HTML, CSS, and JavaScript.

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

Click **Commit changes** to save to the branch used for Pages (normally `main`).
If you create a pull request, merge it into that branch before expecting a site update.
Once Pages is enabled, GitHub publishes the change automatically; allow a few minutes, then reload the page. Open pages do not update in real time.

## Host on GitHub Pages when ready

This site is configured for GitHub Pages using the `main` branch and the repository root.

- Website: https://kevinventullo.github.io/FortyForForty/
- Repository: https://github.com/kevinventullo/FortyForForty

```sh
node --test tests/data.test.mjs
node --check assets/app.mjs
```

The tests cover section editing, moving unfinished tricks to landed, date validation, sorting, time-zone-safe dates, and preservation of the initial imported tricks. No npm install is needed.
