import { skaters, sortTricks } from "./data.mjs";
import { EDITOR_API } from "./editor-config.mjs";

const person = new URL(location.href).searchParams.get("person");
const skater = skaters.find(entry => entry.id === person);
const login = document.querySelector("#login");
const editor = document.querySelector("#editor");
const entries = document.querySelector("#entries");
const message = document.querySelector("#message");
const reload = document.querySelector("#reload");
const storageKey = "forty-editor:" + person;
let token = "";
let sha = "";
let savedState = "";
let busy = false;
let rowNumber = 0;

function say(text, error = false) {
  const saveMessage = document.querySelector("#save-message");
  const target = editor.hidden ? message : saveMessage;
  const other = editor.hidden ? saveMessage : message;
  other.textContent = "";
  target.textContent = text;
  target.classList.toggle("error", error);
}

function storeToken(value) {
  token = value;
  try { value ? sessionStorage.setItem(storageKey, value) : sessionStorage.removeItem(storageKey); } catch {}
}

function readRows() {
  return Array.from(entries.children, row => {
    const trick = { name: row.querySelector(".name").value.trim(), date: row.querySelector(".status").value === "landed" ? row.querySelector(".date").value : null };
    if (trick.date !== null && row.dataset.video) trick.video = row.dataset.video;
    return trick;
  });
}

function dirty() {
  return Boolean(sha) && JSON.stringify(readRows()) !== savedState;
}

function showLogin(text) {
  storeToken("");
  editor.hidden = true;
  login.hidden = false;
  reload.hidden = true;
  say(text);
  document.querySelector("#password").focus();
}

async function api(path, options = {}) {
  const response = await fetch(EDITOR_API + path, {
    ...options, credentials: "omit", cache: "no-store",
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}) },
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "Couldn't complete the request. Try again.");
    error.status = response.status;
    throw error;
  }
  return result;
}

function addRow(trick = { name: "", date: null }) {
  const row = document.createElement("div");
  row.className = "edit-entry";
  row.dataset.video = trick.video || "";
  row.innerHTML = '<label>Trick<input class="name" type="text" required maxlength="120"></label><div class="entry-fields"><label>Status<select class="status"><option value="landed">Landed</option><option value="unfinished">Not yet done</option></select></label><label class="date-label">Date<input class="date" type="date"></label><button class="remove" type="button">Remove</button></div>';
  row.querySelector(".name").value = trick.name;
  const status = row.querySelector(".status");
  const date = row.querySelector(".date");
  const dateLabel = row.querySelector(".date-label");
  const id = "trick-" + (++rowNumber);
  row.querySelector(".name").id = id;
  row.querySelector(".remove").setAttribute("aria-label", "Remove " + (trick.name || "new trick"));
  status.value = trick.date === null ? "unfinished" : "landed";
  date.value = trick.date || "";
  function syncStatus() {
    const landed = status.value === "landed";
    dateLabel.hidden = !landed;
    date.disabled = !landed;
    date.required = landed;
  }
  status.addEventListener("change", syncStatus);
  row.querySelector(".remove").addEventListener("click", () => row.remove());
  syncStatus();
  entries.append(row);
  return row;
}

async function loadList() {
  const result = await api("/lists/" + person);
  sha = result.sha;
  entries.replaceChildren();
  sortTricks(result.tricks).forEach(addRow);
  savedState = JSON.stringify(readRows());
  login.hidden = true;
  editor.hidden = false;
  reload.hidden = true;
  say("");
}

login.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  login.querySelector("fieldset").disabled = true;
  say("Signing in…");
  try {
    const result = await api("/login", { method: "POST", body: JSON.stringify({ person, password: document.querySelector("#password").value }) });
    document.querySelector("#password").value = "";
    storeToken(result.token);
    if (sha && dirty()) { login.hidden = true; editor.hidden = false; say("Signed in. Your unsaved changes are still here."); }
    else await loadList();
  } catch (error) {
    say(error.message === "Failed to fetch" ? "Couldn't connect. Try again." : error.message, true);
  } finally {
    busy = false;
    login.querySelector("fieldset").disabled = false;
  }
});

document.querySelector("#add").addEventListener("click", () => addRow().querySelector(".name").focus());
editor.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  const tricks = readRows();
  busy = true;
  document.querySelector("#editor-fields").disabled = true;
  say("Saving…");
  try {
    const result = await api("/lists/" + person, { method: "PUT", body: JSON.stringify({ sha, tricks }) });
    sha = result.sha;
    savedState = JSON.stringify(readRows());
    reload.hidden = true;
    say("Saved. The public page may take a few minutes to update.");
  } catch (error) {
    if (error.status === 401) showLogin("Your session expired. Sign in again to save your changes.");
    else { say(error.message === "Failed to fetch" ? "Couldn't connect. Your changes are still here; try again." : error.message, true); reload.hidden = error.status !== 409; }
  } finally {
    busy = false;
    document.querySelector("#editor-fields").disabled = false;
  }
});

reload.addEventListener("click", async () => {
  if (busy || (dirty() && !confirm("Discard your unsaved changes and load the latest list?"))) return;
  busy = true;
  reload.disabled = true;
  try { await loadList(); }
  catch (error) { if (error.status === 401) showLogin("Sign in again to reload."); else say(error.message, true); }
  finally { busy = false; reload.disabled = false; }
});

document.querySelector("#logout").addEventListener("click", () => {
  if (dirty() && !confirm("Log out and discard your unsaved changes?")) return;
  sha = "";
  entries.replaceChildren();
  showLogin("Logged out.");
});

addEventListener("beforeunload", event => {
  if (dirty()) { event.preventDefault(); event.returnValue = ""; }
});

if (!skater) {
  say("Choose a person from the home page.", true);
} else {
  document.title = "Edit " + skater.name;
  document.querySelector("#title").textContent = "Edit " + skater.name;
  document.querySelector("#back").href = person + ".html";
  document.querySelector("#username").value = person;
  if (!EDITOR_API) say("Editing is not enabled yet.");
  else {
    try { token = sessionStorage.getItem(storageKey) || ""; } catch {}
    if (token) {
      say("Loading…");
      loadList().catch(error => showLogin(error.status === 401 ? "Sign in to edit your list." : error.message));
    } else showLogin("");
  }
}
