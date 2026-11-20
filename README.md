# Forty for Forty

Skateboarding trick lists.
HTML, CSS, and JavaScript.

## Edit on the site

Open your page, choose **Edit**, enter your editing password, then make changes and choose **Save changes**. The public list updates after publishing finishes.

Backend setup and password resets are documented in [worker/README.md](worker/README.md).

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

## Add a video

1. Open the person's `videos/<person>/` directory on GitHub.
2. Choose **Add file → Upload files**, select your MP4 (for example, `half-cab-flip.mp4`), and **Commit changes** to `main`.
3. Edit the person's file in `data/` and append the filename to the landed trick:

   ```text
   Half cab flip | 2026-11-14 | half-cab-flip.mp4
   ```

4. Commit the text edit to `main`. Wait for Pages to deploy, reload the website, and click the trick name.

Use just the filename, matching capitalization and spaces exactly. The example above uses `videos/<person>/half-cab-flip.mp4`. The filename does not have to match the trick name. Leave the third field off for tricks without a video.

Use an MP4 containing H.264 video (AAC audio if included). Renaming a `.mov` file does not convert it. GitHub's browser upload limit is **25 MiB per file**. [Upload instructions](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository) · [Video formats](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs)

## Host on GitHub Pages when ready

This site is configured for GitHub Pages using the `main` branch and the repository root.

- Website: https://kevinventullo.github.io/FortyForForty/
- Repository: https://github.com/kevinventullo/FortyForForty

```sh
node --test tests/data.test.mjs
node --check assets/app.mjs
node --check assets/video.mjs
```

The tests cover section editing, moving unfinished tricks to landed, date and video filename validation, sorting, time-zone-safe dates, and preservation of the initial imported tricks. No npm install is needed.

## Run locally

From this folder:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Visit **http://localhost:8000**. Stop the server with Ctrl+C.
Use the local server instead of double-clicking HTML files: browsers need HTTP to load the trick data and JavaScript modules.

- `index.html` — links to the individual lists
- `<person>.html` — individual trick lists
- `data/<person>.txt` — the editable trick lists
