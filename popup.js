const DEFAULTS = { eagleToken: "", autoTags: false, authorTag: false, folderId: "" };
const tokenInput = document.querySelector("#token");
const autoTagsInput = document.querySelector("#auto-tags");
const authorTagInput = document.querySelector("#author-tag");
const folderInput = document.querySelector("#folder-id");
const message = document.querySelector("#message");

chrome.storage.local.get(DEFAULTS).then((settings) => {
  tokenInput.value = settings.eagleToken || "";
  autoTagsInput.checked = Boolean(settings.autoTags);
  authorTagInput.checked = Boolean(settings.authorTag);
  folderInput.value = settings.folderId || "";
});

document.querySelector("#toggle-token").addEventListener("click", (event) => {
  const visible = tokenInput.type === "text";
  tokenInput.type = visible ? "password" : "text";
  event.currentTarget.textContent = visible ? "显示" : "隐藏";
});

document.querySelector("#save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    eagleToken: tokenInput.value.trim(),
    autoTags: autoTagsInput.checked,
    authorTag: authorTagInput.checked,
    folderId: folderInput.value.trim()
  });
  message.classList.remove("error");
  message.textContent = "设置已保存";
  window.setTimeout(() => { message.textContent = ""; }, 2200);
});
