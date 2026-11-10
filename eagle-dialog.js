(() => {
  const HOST_ID = "social-eagle-not-open-dialog";
  let activeHost = null;
  let activeFrame = null;

  window.addEventListener("message", (event) => {
    if (!activeFrame || event.source !== activeFrame.contentWindow ||
        event.data?.channel !== "social-eagle-not-open-dialog" ||
        !["cancel", "open"].includes(event.data.action)) return;

    if (event.data.action === "open") {
      const opener = document.createElement("iframe");
      opener.src = chrome.runtime.getURL("eagle-opener/index.html");
      opener.title = "打开 Eagle";
      opener.setAttribute("aria-hidden", "true");
      opener.style.cssText = "position:fixed;width:0;height:0;opacity:0;border:0;pointer-events:none";
      document.documentElement.appendChild(opener);
      window.setTimeout(() => opener.remove(), 2000);
    }

    activeHost?.remove();
    activeHost = null;
    activeFrame = null;
  });

  function showEagleNotOpenedDialog() {
    if (activeHost?.isConnected) {
      activeFrame?.contentWindow?.focus();
      return;
    }

    const host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all:initial; position:fixed; inset:0; z-index:2147483647; display:block; }
        iframe { display:block; width:100%; height:100%; border:0; background:transparent; }
      </style>
      <iframe title="尚未打开 Eagle" src="${chrome.runtime.getURL("eagle-dialog/index.html")}"></iframe>`;
    activeFrame = shadow.querySelector("iframe");
    activeHost = host;
    document.documentElement.appendChild(host);
  }

  globalThis.SocialEagleDialog = { showEagleNotOpenedDialog };
})();
