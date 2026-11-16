import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseTricks, sortTricks, formatDate, getVideoURL } from "../assets/data.mjs";

test("human-edited lists support comments, blank lines, CRLF, and whitespace", () => {
  assert.deepEqual(parseTricks("\uFEFF# Tricks\r\n\r\n Half cab flip | 2026-11-14  \r\nFakie shove|2026-10-10"), [
    { date: "2026-11-14", name: "Half cab flip" },
    { date: "2026-10-10", name: "Fakie shove" },
  ]);
  assert.deepEqual(parseTricks("# No tricks yet\n"), []);
});

test("invalid entries and impossible dates fail with a useful line number", () => {
  for (const line of ["2026-11-14 | Flip", "Flip | 11/14/26", " | 2026-11-14", "Flip | 2026-02-29", "Flip | 2026-04-31", "Flip | 2026-13-01"]) {
    assert.throws(() => parseTricks("# Header\n" + line, "Andrew"), /Andrew, line 2:/);
  }
  assert.equal(parseTricks("Leap flip | 2028-02-29").length, 1);
});

test("sorts dates and names without changing the source order", () => {
  const tricks = [
    { date: "2026-10-10", name: "Z trick" },
    { date: "2026-11-14", name: "B trick" },
    { date: "2026-11-14", name: "A trick" },
  ];
  assert.deepEqual(sortTricks(tricks).map(t => t.name), ["B trick", "A trick", "Z trick"]);
  assert.deepEqual(sortTricks(tricks, "oldest").map(t => t.name), ["Z trick", "B trick", "A trick"]);
  assert.deepEqual(sortTricks(tricks, "name").map(t => t.name), ["A trick", "B trick", "Z trick"]);
  assert.equal(tricks[0].name, "Z trick");
});

test("dates display as recorded regardless of the host time zone", () => {
  assert.equal(formatDate("2026-11-14"), "Nov 14, 2026");
  assert.equal(formatDate("2026-01-01"), "Jan 1, 2026");
});

test("the editable files parse and preserve every trick from the original import", async () => {
  const original = await readFile(new URL("../tricklist.txt", import.meta.url), "utf8");
  const imported = { andrew: [], kevin: [], erik: [] };
  let person;
  let date;
  for (const line of original.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
    if (/^(Andrew|Kevin):$/.test(line)) {
      person = line.slice(0, -1).toLowerCase();
    } else if (/^\d{2}\/\d{2}\/\d{2}:$/.test(line)) {
      const [month, day, year] = line.slice(0, -1).split("/");
      date = `20${year}-${month}-${day}`;
    } else {
      imported[person].push({ date, name: line });
    }
  }
  for (const id of Object.keys(imported)) {
    const current = parseTricks(await readFile(new URL(`../data/${id}.txt`, import.meta.url), "utf8"), id);
    for (const expected of imported[id]) {
      assert.ok(current.some(t => t.name === expected.name && t.date === expected.date), `Missing imported trick: ${id}, ${expected.name}`);
    }
  }
});

test("sections support landed and not-yet-done tricks, including empty lists", () => {
  assert.deepEqual(parseTricks("[Landed]\nHalf cab flip | 2026-11-14\n\n[Not Yet Done]\n# Next up\nNollie 360 Flip\n"), [
    { date: "2026-11-14", name: "Half cab flip" },
    { date: null, name: "Nollie 360 Flip" },
  ]);
  assert.deepEqual(parseTricks("[Landed]\n[Not Yet Done]\n"), []);
  assert.deepEqual(parseTricks(" [not yet done] \r\n Nollie 360 Flip \r\n"), [
    { date: null, name: "Nollie 360 Flip" },
  ]);
});

test("section mistakes report the line instead of creating incorrect entries", () => {
  assert.throws(() => parseTricks("[Not Yet]\nNollie 360 Flip", "Andrew"), /Andrew, line 1:/);
  assert.throws(() => parseTricks("[Not Yet Done]\nNollie 360 Flip | 2026-11-14", "Andrew"), /Andrew, line 2:/);
  assert.throws(() => parseTricks("[Landed]\nNollie 360 Flip", "Andrew"), /Andrew, line 2:/);
});

test("unfinished tricks follow landed tricks and keep their file order", () => {
  const tricks = parseTricks("[Not Yet Done]\nNollie 360 Flip\nHeelflip\n[Landed]\nKickflip | 2026-10-10\nHalf cab flip | 2026-11-14");
  assert.deepEqual(sortTricks(tricks).map(t => t.name), ["Half cab flip", "Kickflip", "Nollie 360 Flip", "Heelflip"]);
  assert.deepEqual(sortTricks(tricks, "oldest").map(t => t.name), ["Kickflip", "Half cab flip", "Nollie 360 Flip", "Heelflip"]);
  assert.deepEqual(sortTricks(parseTricks("[Not Yet Done]\nKickflip")), [{ date: null, name: "Kickflip" }]);
  assert.equal(tricks[0].date, null);
});

test("moving a trick to Landed gives it a date and removes the unfinished entry", () => {
  const before = "[Landed]\n\n[Not Yet Done]\nNollie 360 Flip\n";
  const after = "[Landed]\nNollie 360 Flip | 2026-11-15\n\n[Not Yet Done]\n";
  assert.deepEqual(parseTricks(before), [{ date: null, name: "Nollie 360 Flip" }]);
  assert.deepEqual(parseTricks(after), [{ date: "2026-11-15", name: "Nollie 360 Flip" }]);
});

test("video filenames are optional and preserve existing two-column entries", () => {
  assert.deepEqual(parseTricks("[Landed]\nHalf cab flip | 2026-11-14 | half-cab-flip.mp4\nFakie flip | 2026-11-14\nKickflip | 2026-10-10 | "), [
    { name: "Half cab flip", date: "2026-11-14", video: "half-cab-flip.mp4" },
    { name: "Fakie flip", date: "2026-11-14" },
    { name: "Kickflip", date: "2026-10-10" },
  ]);
  assert.equal(parseTricks("Half cab flip | 2026-11-14 | Half cab flip.MP4")[0].video, "Half cab flip.MP4");
});

test("video fields reject paths, URLs, other formats, and extra columns", () => {
  for (const file of ["../flip.mp4", "/flip.mp4", "folder/flip.mp4", "folder\\flip.mp4", "https://example.com/flip.mp4", "flip.mov", ".mp4", "flip.mp4 | extra"]) {
    assert.throws(() => parseTricks("[Landed]\nFlip | 2026-11-14 | " + file, "Andrew"), /Andrew, line 2:/);
  }
  assert.throws(() => parseTricks("[Not Yet Done]\nFlip | flip.mp4", "Andrew"), /Andrew, line 2:/);
});

test("video URLs keep the person's folder and safely encode filenames", () => {
  const url = new URL(getVideoURL("andrew", "Half cab #1?.mp4"));
  assert.ok(url.pathname.endsWith("/videos/andrew/Half%20cab%20%231%3F.mp4"));
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  assert.ok(new URL(getVideoURL("kevin", "flip.mp4")).pathname.endsWith("/videos/kevin/flip.mp4"));
  assert.throws(() => getVideoURL("../andrew", "flip.mp4"), /Unknown skater/);
  assert.throws(() => getVideoURL("andrew", "../flip.mp4"), /filename/);
});
