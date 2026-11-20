import { parseTricks } from "../assets/data.mjs";

export function validateTricks(tricks) {
  if (!Array.isArray(tricks) || tricks.length > 500) throw new Error("A list can contain up to 500 tricks.");
  return tricks.map((trick, index) => {
    const prefix = "Trick " + (index + 1) + ": ";
    if (!trick || typeof trick !== "object" || Array.isArray(trick)) throw new Error(prefix + "invalid entry.");
    if (typeof trick.name !== "string" || !trick.name.trim() || trick.name.trim().length > 120 || /[|\r\n\u0000-\u001f\u007f]/.test(trick.name) || /^[#\[]/.test(trick.name.trim())) {
      throw new Error(prefix + "enter a name of up to 120 characters without |, line breaks, or a leading # or [.");
    }
    const name = trick.name.trim();
    if (trick.date === null) {
      if (trick.video) throw new Error(prefix + "unfinished tricks cannot have a video.");
      return { name, date: null };
    }
    if (typeof trick.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(trick.date)) throw new Error(prefix + "choose a landed date.");
    if (trick.video !== undefined && (typeof trick.video !== "string" || trick.video.length > 200)) throw new Error(prefix + "invalid video filename.");
    const line = name + " | " + trick.date + (trick.video ? " | " + trick.video : "");
    try {
      return parseTricks(line, "Trick " + (index + 1))[0];
    } catch {
      throw new Error(prefix + "check the date and MP4 filename.");
    }
  });
}

export function serializeTricks(tricks) {
  const valid = validateTricks(tricks);
  const landed = valid.filter(trick => trick.date !== null).map(trick =>
    trick.name + " | " + trick.date + (trick.video ? " | " + trick.video : ""));
  const unfinished = valid.filter(trick => trick.date === null).map(trick => trick.name);
  return [
    "# Landed: Trick name | YYYY-MM-DD | filename.mp4 (video is optional)",
    "# Not Yet Done: Trick name only",
    "",
    "[Landed]",
    ...landed,
    "",
    "[Not Yet Done]",
    ...unfinished,
    "",
  ].join("\n");
}
