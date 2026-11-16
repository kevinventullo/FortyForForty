import { loadTricks, sortTricks, formatDate } from "./data.mjs";

async function renderTricks() {
  const region = document.querySelector("[data-tricks]");
  try {
    const tricks = sortTricks(await loadTricks(document.body.dataset.person));
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
      const name = document.createElement("span");
      name.textContent = trick.name;
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
