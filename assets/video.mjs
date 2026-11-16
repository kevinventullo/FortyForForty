// One reusable player. No video URL is assigned until a trick is clicked.
export function createVideoPlayer() {
  const dialog = document.createElement("dialog");
  dialog.className = "video-dialog";
  dialog.setAttribute("aria-labelledby", "video-title");
  dialog.innerHTML = `
    <div class="video-header">
      <h2 id="video-title"></h2>
      <button type="button" autofocus>Close</button>
    </div>
    <video controls playsinline preload="none"></video>
    <p class="video-error" role="alert" hidden>Couldn't play this clip. <a>Open video directly</a>.</p>
  `;
  const title = dialog.querySelector("h2");
  const close = dialog.querySelector("button");
  const video = dialog.querySelector("video");
  const error = dialog.querySelector(".video-error");
  const directLink = error.querySelector("a");
  let opener;

  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    error.hidden = true;
    opener?.focus();
  });
  video.addEventListener("error", () => {
    if (dialog.open && video.hasAttribute("src")) error.hidden = false;
  });
  document.body.append(dialog);

  return {
    open(name, url, trigger) {
      opener = trigger;
      title.textContent = name;
      video.setAttribute("aria-label", name);
      error.hidden = true;
      directLink.href = url;
      dialog.showModal();
      video.src = url;
      // Autoplay may be blocked; the native Play control remains available.
      video.play().catch(() => {});
    },
  };
}
