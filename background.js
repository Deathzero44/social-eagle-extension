const DEFAULT_SETTINGS = {
  eagleToken: "",
  autoTags: false,
  authorTag: false,
  folderId: ""
};

const EAGLE_API = "http://localhost:41595/api/item/addFromURL";
const EAGLE_PATH_API = "http://localhost:41595/api/item/addFromPath";
const downloadWaiters = new Map();

chrome.downloads?.onChanged.addListener((delta) => {
  const waiter = downloadWaiters.get(delta.id);
  if (!waiter) return;

  if (delta.state?.current === "complete") {
    chrome.downloads.search({ id: delta.id }, (items) => {
      const error = chrome.runtime.lastError;
      if (error) waiter.finish(new Error(error.message));
      else if (!items?.[0]?.filename) waiter.finish(new Error("下载完成，但没有取得临时文件路径。"));
      else waiter.finish(null, items[0]);
    });
  } else if (delta.state?.current === "interrupted" || delta.error?.current) {
    chrome.downloads.search({ id: delta.id }, (items) => {
      const detail = items?.[0]?.error || delta.error?.current || "下载中断";
      waiter.finish(new Error(`视频下载失败：${detail}`));
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!new Set(["IMPORT_XHS_POST", "IMPORT_IG_POST", "IMPORT_X_POST"]).has(message?.type)) return undefined;

  importPost(message.payload)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || "导入失败" }));

  return true;
});

async function importPost(payload) {
  const settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(DEFAULT_SETTINGS)) };
  if (!settings.eagleToken.trim()) {
    return { ok: false, error: "请先在扩展弹窗中填写 Eagle Token。" };
  }

  const platform = ["instagram", "x"].includes(payload?.platform) ? payload.platform : "xiaohongshu";
  const media = deduplicateMedia(payload?.media, platform);
  if (!media.length) return { ok: false, error: "没有找到可导入的图片或视频。" };

  const tags = [];
  if (settings.autoTags && Array.isArray(payload.tags)) tags.push(...payload.tags);
  if (settings.authorTag && payload.author) tags.push(payload.author);
  const cleanTags = [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
  const fallbackName = platform === "instagram" ? "Instagram 帖子" : platform === "x" ? "X 帖子" : "小红书帖子";
  const baseName = [payload.title, payload.author].map((part) => String(part || "").trim()).filter(Boolean).join(" - ") || fallbackName;

  const results = new Array(media.length);
  const importItem = async (index) => {
    const item = media[index];
    const ordinal = Number(item.index) || index + 1;
    const itemName = Math.max(media.length, Number(payload.expectedMediaCount) || 0) > 1 ? `${baseName} (${ordinal})` : baseName;
    const body = {
      url: item.url,
      name: itemName,
      website: payload.url || "",
      tags: cleanTags,
      annotation: payload.description || "",
      token: settings.eagleToken.trim()
    };
    if (settings.folderId.trim()) body.folderId = settings.folderId.trim();

    try {
      if ((platform === "instagram" || platform === "x") && item.kind === "video") {
        results[index] = await importRemoteVideo(platform, item.url, body, index);
      } else {
        if (platform === "instagram") {
          body.headers = { referer: "https://www.instagram.com/" };
        } else if (platform === "x") {
          body.headers = { referer: "https://x.com/" };
        }
        results[index] = await addToEagle(EAGLE_API, body);
      }
    } catch (error) {
      results[index] = { ok: false, reason: error.message || "无法连接 Eagle" };
    }
    if (!results[index].ok) results[index].reason = `第 ${ordinal} 项${item.kind === "video" ? "视频" : "图片"}：${results[index].reason}`;
  };

  if (platform === "instagram" || platform === "x") {
    // Keep images moving even if a video link is slow or broken.
    // File names retain their original post-media indices.
    const runQueue = async (video) => {
      for (let index = 0; index < media.length; index += 1) {
        if ((media[index].kind === "video") === video) await importItem(index);
      }
    };
    await Promise.all([runQueue(false), runQueue(true)]);
  } else {
    for (let index = 0; index < media.length; index += 1) await importItem(index);
  }
  for (const item of payload.unresolvedMedia || []) {
    results.push({ ok: false, reason: `第 ${item.index} 项：${item.reason || "没有读取到媒体地址"}` });
  }

  const imported = results.filter((result) => result.ok).length;
  const failed = results.length - imported;
  if (failed === 0) return { ok: true, imported, total: results.length };

  const firstError = results.find((result) => !result.ok)?.reason || "导入失败";
  return {
    ok: imported > 0,
    imported,
    total: results.length,
    error: imported > 0 ? `部分导入成功；${firstError}` : firstError
  };
}

async function importRemoteVideo(platform, url, itemBody, index) {
  // The older API documentation calls addFromURL an image endpoint, but that
  // wording does not prove it rejects videos. Use the same URL route first,
  // retaining local-file import as a fallback for explicit Eagle API failures.
  const referer = platform === "instagram" ? "https://www.instagram.com/" : "https://x.com/";
  const direct = await addToEagle(EAGLE_API, { ...itemBody, headers: { referer } });
  if (direct.ok) return direct;
  if (!chrome.downloads) {
    return { ok: false, reason: `${direct.reason}；本地文件备用导入需要下载权限。` };
  }

  let downloadId = null;
  try {
    const extension = getVideoExtension(url);
    const filename = `社媒采集Eagle临时/${platform}-${Date.now()}-${index + 1}${extension}`;
    downloadId = await startDownload(url, filename);
    const downloaded = await waitForDownload(downloadId);
    const pathBody = { ...itemBody, path: downloaded.filename };
    delete pathBody.url;
    return await addToEagle(EAGLE_PATH_API, pathBody);
  } catch (error) {
    return { ok: false, reason: error.message || "视频导入失败" };
  } finally {
    if (downloadId !== null) await cleanDownload(downloadId).catch(() => {});
  }
}

function getVideoExtension(value) {
  try {
    const pathname = new URL(value).pathname;
    const extension = pathname.match(/\.(mp4|mov|m4v|webm)$/i)?.[0];
    return extension || ".mp4";
  } catch {
    return ".mp4";
  }
}

function startDownload(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url,
      filename,
      saveAs: false,
      conflictAction: "uniquify"
    }, (downloadId) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(`无法开始下载视频：${error.message}`));
      else resolve(downloadId);
    });
  });
}

function waitForDownload(downloadId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, item) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(poll);
      downloadWaiters.delete(downloadId);
      if (error) reject(error);
      else resolve(item);
    };
    const timeout = setTimeout(() => finish(new Error("视频下载超时。")), 3 * 60 * 1000);
    const poll = setInterval(check, 10000);
    downloadWaiters.set(downloadId, { finish });

    // A very short download could finish before the waiter was registered.
    function check() {
      chrome.downloads.search({ id: downloadId }, (items) => {
        const error = chrome.runtime.lastError;
        if (error) finish(new Error(error.message));
        else if (items?.[0]?.state === "complete") finish(null, items[0]);
        else if (items?.[0]?.state === "interrupted") finish(new Error(`视频下载失败：${items[0].error || "下载中断"}`));
      });
    }
    check();
  });
}

async function cleanDownload(downloadId) {
  const items = await new Promise((resolve) => {
    chrome.downloads.search({ id: downloadId }, (result) => resolve(result || []));
  });
  if (items[0]?.state === "complete") {
    await new Promise((resolve) => chrome.downloads.removeFile(downloadId, resolve));
  } else if (items[0]?.state === "in_progress") {
    await new Promise((resolve) => chrome.downloads.cancel(downloadId, resolve));
  }
  await new Promise((resolve) => chrome.downloads.erase({ id: downloadId }, resolve));
}

async function addToEagle(endpoint, body) {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 90000);
  let response;
  let text;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abort.signal
    });
    text = await response.text();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Eagle 导入响应超时，请检查 Eagle 中是否已收到该文件。");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { message: text };
  }

  if (!response.ok || result.status !== "success") {
    const reason = result.message || result.error || `Eagle API 返回 HTTP ${response.status}`;
    return { ok: false, reason };
  }
  return { ok: true };
}

function deduplicateMedia(items, platform) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  return items
    .filter((item) => item && typeof item.url === "string" && /^https?:\/\//i.test(item.url))
    .filter((item) => platform === "instagram" ? isInstagramMediaUrl(item.url) : platform === "x" ? isXMediaUrl(item.url) : true)
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
}

function isXMediaUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "pbs.twimg.com" || host === "video.twimg.com";
  } catch {
    return false;
  }
}

function isInstagramMediaUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "cdninstagram.com" || host.endsWith(".cdninstagram.com") ||
      host === "fbcdn.net" || host.endsWith(".fbcdn.net");
  } catch {
    return false;
  }
}
