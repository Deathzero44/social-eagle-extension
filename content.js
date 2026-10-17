(() => {
  const NOTE_ROOT_SELECTOR = "#noteContainer";
  const BUTTON_HOST_ID = "hc-eagle-import-host";
  const MEDIA_REGION_SELECTOR = ".media-container, .note-content .left-card, .note-media, [data-v-1c9f8dfe], .swiper-container, .interaction-container";
  const MEDIA_ELEMENT_SELECTOR = ".img-container img, video, .player-video";
  let scanTimer = 0;

  function isRendered(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let current = element; current instanceof Element; current = current.parentElement) {
      const style = window.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    }
    return true;
  }

  function getVisibleNoteRoot() {
    const root = document.querySelector(NOTE_ROOT_SELECTOR);
    return isRendered(root) ? root : null;
  }

  function findMediaRegion(noteRoot) {
    const regions = [...noteRoot.querySelectorAll(MEDIA_REGION_SELECTOR)];
    const mediaRegion = regions.find((element) =>
      isRendered(element) && element.querySelector(MEDIA_ELEMENT_SELECTOR)
    );
    if (mediaRegion) return mediaRegion;

    const media = noteRoot.querySelector(MEDIA_ELEMENT_SELECTOR);
    if (!media) return null;
    const ancestor = media.closest(".media-container, .note-media, .swiper-container, .left-card, [data-v-1c9f8dfe], .interaction-container");
    if (ancestor && noteRoot.contains(ancestor)) return ancestor;
    return media.closest(".img-container") || media.parentElement;
  }

  function scan() {
    const noteRoot = getVisibleNoteRoot();
    const mediaRegion = noteRoot && findMediaRegion(noteRoot);
    if (!noteRoot || !isRendered(mediaRegion)) {
      document.querySelectorAll(`#${BUTTON_HOST_ID}`).forEach((host) => host.remove());
      return;
    }

    let host = document.getElementById(BUTTON_HOST_ID);
    if (host?.parentElement !== mediaRegion) {
      host?.remove();
      host = createButtonHost();
      const style = window.getComputedStyle(mediaRegion);
      if (style.position === "static") mediaRegion.style.position = "relative";
      mediaRegion.appendChild(host);
    }
  }

  function createButtonHost() {
    const host = document.createElement("div");
    host.id = BUTTON_HOST_ID;
    host.style.cssText = "position:absolute;top:16px;left:16px;z-index:999999;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .pill {
          display:flex; align-items:center; padding:4px 8px; border:0;
          border-radius:12px; color:#fff; background:rgba(0,0,0,.4);
          backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
          cursor:pointer; user-select:none; white-space:nowrap;
          transition:all .3s; font:500 12px/16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        }
        .pill:hover { background:rgba(0,0,0,.6); }
        .pill:disabled { cursor:wait; opacity:.82; }
        .eagle-icon { display:block; width:18px; height:18px; margin-right:4px; flex:none; }
        .label { font:inherit; }
      </style>
      <button class="pill" type="button" aria-label="导入 Eagle">
        <img class="eagle-icon" alt="" src="${chrome.runtime.getURL("icons/eagle_white.png")}">
        <span class="label">导入Eagle</span>
      </button>`;

    const button = shadow.querySelector("button");
    const label = shadow.querySelector(".label");
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;

      button.disabled = true;
      label.textContent = "导入中…";
      try {
        const noteRoot = getVisibleNoteRoot();
        const mediaRegion = noteRoot && findMediaRegion(noteRoot);
        if (!noteRoot || !mediaRegion) throw new Error("当前没有打开的小红书帖子。");
        const payload = await collectPost(noteRoot, mediaRegion);
        const result = await chrome.runtime.sendMessage({ type: "IMPORT_XHS_POST", payload });
        if (result?.ok && !result.error) {
          label.textContent = `已导入 ${result.imported} 项`;
          button.title = "已保存到 Eagle";
        } else if (result?.ok) {
          label.textContent = `部分成功 ${result.imported}/${result.total}`;
          button.title = result.error || "部分媒体未能导入";
        } else {
          label.textContent = "导入失败";
          button.title = result?.error || "请检查 Eagle 是否运行以及扩展设置";
        }
      } catch (error) {
        label.textContent = "导入失败";
        button.title = error.message || "扩展后台暂不可用";
      } finally {
        button.disabled = false;
        window.setTimeout(() => {
          if (label.isConnected) label.textContent = "导入Eagle";
        }, 3500);
      }
    });
    return host;
  }

  async function collectPost(noteRoot, mediaRegion) {
    const title = readText(noteRoot.querySelector("#detail-title")) || document.title;
    const author = readText(noteRoot.querySelector(".author-wrapper .username"));
    const descriptionElement = noteRoot.querySelector("#detail-desc .note-text");
    const description = readText(descriptionElement) || readText(noteRoot.querySelector("#detail-desc"));
    const tags = [...noteRoot.querySelectorAll("#detail-desc .tag")]
      .map((element) => readText(element).replace(/^#/, ""))
      .filter(Boolean);
    for (const tag of description.match(/#[^\s#，。！？；、]+/g) || []) tags.push(tag.slice(1));

    const isVideoPost = noteRoot.getAttribute("data-type") === "video";
    const media = isVideoPost
      ? (await getVideoUrls(mediaRegion)).map((url) => ({ url, kind: "video" }))
      : getImageUrls(mediaRegion).map((url) => ({ url, kind: "image" }));

    return {
      title,
      author,
      description,
      url: window.location.href,
      tags: [...new Set(tags)],
      media
    };
  }

  function readText(element) {
    return (element?.innerText || element?.textContent || "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function getImageUrls(mediaRegion) {
    const imageContainers = [];
    if (mediaRegion.matches?.(".img-container")) imageContainers.push(mediaRegion);
    imageContainers.push(...mediaRegion.querySelectorAll(".img-container"));

    const urls = [];
    for (const container of imageContainers) {
      if (container.querySelector(".live-photo-contain") || container.closest(".live-photo-contain")) continue;
      const image = container.querySelector("img");
      const url = image && readImageUrl(image);
      if (isXhsMediaUrl(url)) urls.push(normalizeImageUrl(url));
    }

    // Some XHS builds omit .img-container; then fall back only to the current post's media region.
    if (!urls.length) {
      for (const image of mediaRegion.querySelectorAll("img")) {
        if (image.closest(".live-photo-contain") || /avatar|profile|emoji|icon/i.test(image.className || "")) continue;
        const url = readImageUrl(image);
        if (isXhsMediaUrl(url)) urls.push(normalizeImageUrl(url));
      }
    }
    return [...new Set(urls)];
  }

  function readImageUrl(image) {
    const srcset = image.getAttribute("srcset") || image.getAttribute("data-srcset") || "";
    const largestSrcsetEntry = srcset.split(",").map((entry) => entry.trim().split(/\s+/)[0]).filter(Boolean).pop();
    const candidates = [image.currentSrc, image.getAttribute("src"), image.dataset.src,
      image.getAttribute("data-original"), largestSrcsetEntry];
    return candidates.find(isXhsMediaUrl) || "";
  }

  function normalizeImageUrl(url) {
    return url.replace(/format\/webp/g, "format/jpg");
  }

  function isXhsMediaUrl(value) {
    if (!value || !/^https?:\/\//i.test(value) || /avatar|profile|emoji/i.test(value)) return false;
    try {
      const host = new URL(value).hostname.toLowerCase();
      return host.endsWith(".xhscdn.com") || host === "xhscdn.com" ||
        host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com");
    } catch {
      return false;
    }
  }

  async function getVideoUrls(mediaRegion) {
    const masterUrls = [];
    const playerUrls = [];
    const metaVideo = document.querySelector('meta[property="og:video"], meta[name="og:video"]')?.content;

    for (const element of mediaRegion.querySelectorAll("video, .player-video")) {
      const source = element instanceof HTMLVideoElement
        ? (element.currentSrc || element.src || element.querySelector("source[src]")?.src)
        : (element.getAttribute("src") || element.dataset.src || element.getAttribute("data-video"));
      if (isXhsMediaUrl(source)) playerUrls.push(source);
      if (element instanceof HTMLVideoElement) {
        for (const sourceElement of element.querySelectorAll("source[src]")) {
          if (isXhsMediaUrl(sourceElement.src)) playerUrls.push(sourceElement.src);
        }
      }
    }

    // 好采助手优先从帖子 HTML 的 masterUrl 选择源，避免 og:video 预览地址抢先命中。
    try {
      const response = await fetch(window.location.href, { credentials: "include" });
      if (response.ok) {
        const html = await response.text();
        const matches = html.matchAll(/"masterUrl"\s*:\s*"((?:\\.|[^"\\])*)"/g);
        for (const match of matches) {
          const url = decodeJsonString(match[1]);
          if (isXhsMediaUrl(url)) masterUrls.push(url);
        }
      }
    } catch {
      // A direct video src or og:video URL can still be used when the HTML fetch is unavailable.
    }

    const unique = [...new Set([
      ...masterUrls,
      ...playerUrls,
      ...(isXhsMediaUrl(metaVideo) ? [metaVideo] : [])
    ])];
    for (const suffix of ["_114.mp4", "_115.mp4", "_258.mp4", "_84.mp4"]) {
      const preferred = unique.find((url) => videoPathEndsWith(url, suffix));
      if (preferred) return [preferred];
    }
    return unique.length ? [unique[0]] : [];
  }

  function videoPathEndsWith(url, suffix) {
    try {
      return new URL(url).pathname.toLowerCase().endsWith(suffix);
    } catch {
      return url.split(/[?#]/, 1)[0].toLowerCase().endsWith(suffix);
    }
  }

  function decodeJsonString(value) {
    try {
      return JSON.parse(`"${value}"`);
    } catch {
      return value.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
    }
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 120);
  }

  scan();
  new MutationObserver(scheduleScan).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "data-type"]
  });
})();
