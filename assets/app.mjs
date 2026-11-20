import { EDITOR_API } from "./editor-config.mjs";
import { loadTricks, sortTricks, formatDate, getVideoURL } from "./data.mjs";
import { createVideoPlayer } from "./video.mjs";

let player;

async function renderTricks() {
  const region = document.querySelector("[data-tricks]");
  const person = document.body.dataset.person;
  try {
    const tricks = sortTricks(await loadTricks(person));
    region.replaceChildren();
    if (!tricks.length) {
      const message = document.createElement("p");
      message.textContent = "No tricks yet.";
      region.append(message);
      return;
    }

    const list = document.createElement("ul");
    list.className = "trick-list";
    for (const trick of tricks) {
      const item = document.createElement("li");
      const name = document.createElement(trick.video ? "a" : "span");
      name.className = "trick-name";
      name.textContent = trick.name;
      if (trick.video) {
        name.href = getVideoURL(person, trick.video);
        name.setAttribute("aria-haspopup", "dialog");
        name.setAttribute("aria-label", `Watch ${trick.name}`);
        name.addEventListener("click", (event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          player ??= createVideoPlayer();
          player.open(trick.name, name.href, name);
        });
      }
      item.append(name);
      if (trick.date === null) {
        item.className = "not-yet-done";
        const status = document.createElement("span");
        status.className = "visually-hidden";
        status.textContent = " — not yet done";
        item.append(status);
      } else {
        const date = document.createElement("time");
        date.dateTime = trick.date;
        date.textContent = formatDate(trick.date);
        item.append(date);
      }
      list.append(item);
    }
    region.append(list);
  } catch (error) {
    console.error(error);
    const message = document.createElement("p");
    message.setAttribute("role", "alert");
    message.textContent = "Couldn't load the tricks. Try reloading.";
    region.replaceChildren(message);
  } finally {
    region.removeAttribute("aria-busy");
  }
}

renderTricks();

const editLink = document.querySelector("[data-edit-link]");
if (editLink && EDITOR_API) {
  editLink.href = "edit.html?person=" + encodeURIComponent(document.body.dataset.person);
  editLink.hidden = false;
}
