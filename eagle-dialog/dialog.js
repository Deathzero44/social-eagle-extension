(() => {
  const send = (action) => window.parent.postMessage({
    channel: "social-eagle-not-open-dialog",
    action
  }, "*");

  document.getElementById("cancel").addEventListener("click", () => send("cancel"));
  document.getElementById("open-eagle").addEventListener("click", () => send("open"));
  document.getElementById("backdrop").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) send("cancel");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") send("cancel");
  });
  document.getElementById("open-eagle").focus();
})();
