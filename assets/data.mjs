export const skaters = [
  { id: "andrew", name: "Andrew" },
  { id: "kevin", name: "Kevin" },
  { id: "erik", name: "Erik" },
];

// Dates are calendar dates, never timestamps in the visitor's local time zone.
// A null date means the trick is listed in [Not Yet Done].
export function parseTricks(text, source = "Trick list") {
  const tricks = [];
  let section = "landed";
  for (const [index, raw] of text.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const heading = /^\[\s*(Landed|Not Yet Done)\s*\]$/i.exec(line);
    if (heading) {
      section = heading[1].toLowerCase();
      continue;
    }
    if (line.startsWith("[")) {
      throw new Error(`${source}, line ${index + 1}: use [Landed] or [Not Yet Done] for section headings.`);
    }
    if (section === "not yet done") {
      if (line.includes("|")) {
        throw new Error(`${source}, line ${index + 1}: use only the trick name under [Not Yet Done]; move dated entries to [Landed].`);
      }
      tricks.push({ date: null, name: line });
      continue;
    }
    const match = /^([^|]+?)\s*\|\s*(\d{4}-\d{2}-\d{2})$/.exec(line);
    if (!match || !match[1].trim()) throw new Error(`${source}, line ${index + 1}: use Trick name | YYYY-MM-DD under [Landed].`);
    const [, name, date] = match;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error(`${source}, line ${index + 1}: "${date}" is not a calendar date.`);
    }
    tricks.push({ date, name: name.trim() });
  }
  return tricks;
}

export function sortTricks(tricks, order = "newest") {
  return [...tricks].sort((a, b) => {
    // Keep unfinished tricks below landed tricks, in their file order.
    if (a.date === null && b.date === null) return 0;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    if (order === "name") return a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || b.date.localeCompare(a.date);
    return order === "oldest" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
  });
}

export function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export async function loadTricks(id) {
  if (!skaters.some((skater) => skater.id === id)) throw new Error("Unknown skater.");
  const url = new URL(`../data/${id}.txt`, import.meta.url);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${id}'s list (HTTP ${response.status}).`);
  return parseTricks(await response.text(), `data/${id}.txt`);
}
