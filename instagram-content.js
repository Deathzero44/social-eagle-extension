(() => {
  const HOST_CLASS = "ig-eagle-import-host";
  const POST_ROUTE_PARTS = new Set(["p", "reel", "reels", "tv"]);
  const IGMedia = globalThis.SocialEagleIGMedia;
  const importActions = new WeakMap();
  const QUERY_HASH = "2c4c2e343a8f64c625ba02b2aa12c7f8";
  const QUERY_ID = "9496392173716084";
  let scanTimer = 0;
  let lastPointer = null;

  function parsePostUrl(value) {
    try {
      const url = new URL(value, location.origin);
      if (url.hostname !== "www.instagram.com" && !url.hostname.endsWith(".instagram.com")) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      const routeIndex = parts.findIndex((part) => POST_ROUTE_PARTS.has(part));
      if (routeIndex < 0 || !parts[routeIndex + 1]) return null;

      const route = parts[routeIndex] === "reels" ? "reel" : parts[routeIndex];
      const shortcode = parts[routeIndex + 1];
      if (!/^[\w-]+$/.test(shortcode) || shortcode === "audio") return null;
      return {
        shortcode,
        url: `${url.origin}/${route}/${shortcode}/`
      };
    } catch {
      return null;
    }
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 100 || rect.bottom <= 0 || rect.top >= window.innerHeight ||
        rect.right <= 0 || rect.left >= window.innerWidth) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
  }

  function getArticleContext(article) {
    const post = getPostsIn(article)[0];
    return { root: article, ...(post || { shortcode: "", url: "" }) };
  }

  function getPostsIn(root) {
    const posts = [];
    const anchors = [];
    if (root.matches?.("a[href]")) anchors.push(root);
    anchors.push(...root.querySelectorAll("a[href]"));
    for (const anchor of anchors) {
      const post = parsePostUrl(anchor.href);
      if (post) posts.push(post);
    }
    return posts;
  }

  function getPostShortcodes(root) {
    return new Set(getPostsIn(root).map((post) => post.shortcode));
  }

  function findPostContextFromMedia(media, preferredShortcode = "") {
    const mediaRect = media.getBoundingClientRect();
    let current = media.parentElement;
    let candidate = null;
    let candidatePost = null;

    for (let depth = 0; current && current !== document.body && depth < 16; depth += 1, current = current.parentElement) {
      const rect = current.getBoundingClientRect();
      const boundedToCard = rect.width <= mediaRect.width * 2.8 && rect.height <= mediaRect.height * 3.5;
      if (!boundedToCard) break;

      const posts = getPostsIn(current);
      const shortcodes = new Set(posts.map((post) => post.shortcode));
      if (shortcodes.size > 1) break;
      if (shortcodes.size === 1) {
        const found = shortcodes.values().next().value;
        if (preferredShortcode && found !== preferredShortcode) break;
        candidatePost = posts.find((post) => post.shortcode === found);
        candidate = current;
      }

      if (candidate && current.matches?.("article, [role=article]")) {
        return { ...candidatePost, root: current };
      }
      if (candidate && current.matches?.("main, [role=main]")) break;
    }

    return candidate ? { ...candidatePost, root: candidate } : null;
  }

  function findVisualCardRoot(media) {
    const mediaRect = media.getBoundingClientRect();
    const article = media.closest("article, [role=article]");
    if (article) return article;

    let current = media.parentElement;

    for (let depth = 0; current && current !== document.body && depth < 14; depth += 1, current = current.parentElement) {
      const rect = current.getBoundingClientRect();
      const containsMedia = rect.width >= mediaRect.width * 0.95 && rect.height >= mediaRect.height * 0.95;
      const boundedSize = rect.width <= mediaRect.width * 2.8 && rect.height <= mediaRect.height * 3.5;
      if (containsMedia && boundedSize) {
        // Only treat a generic div as a post when it contains one permalink.
        // This prevents icons from appearing on stories, avatars, and unrelated
        // large images elsewhere on the page.
        const shortcodes = getPostShortcodes(current);
        if (shortcodes.size === 1) return current;
      }
      if (current.matches?.("main, [role=main]")) break;
    }

    return null;
  }

  function getFeedFallbackRoots() {
    const roots = [];
    // The supplied IG Helper userscript supports Instagram's feed layout by
    // finding the separator HR and walking four levels to its post container.
    // Keep this fallback for cards that expose no <article> role.
    for (const separator of document.querySelectorAll("section > main > div > div > div > div > div > hr")) {
      let root = separator;
      for (let depth = 0; depth < 4 && root; depth += 1) root = root.parentElement;
      if (!root || !isVisible(root) || roots.includes(root)) continue;
      if (root.querySelector("video, img")) roots.push(root);
    }
    return roots;
  }

  function findFeedFallbackRoot(media, roots) {
    return roots
      .filter((root) => root.contains(media))
      .sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return rectA.width * rectA.height - rectB.width * rectB.height;
      })[0] || null;
  }

  function getMainMediaElement(root) {
    const candidates = [...root.querySelectorAll("video, img")]
      .filter(isVisible)
      .filter((element) => {
        if (element instanceof HTMLVideoElement) return true;
        const descriptor = `${element.alt || ""} ${element.className || ""}`;
        if (/avatar|profile|emoji|icon|logo/i.test(descriptor)) return false;
        // Do not require a particular CDN hostname just to show the button.
        // Instagram can proxy media or expose a temporary URL while the post
        // is loading; the bounded post root and rendered size identify media.
        return true;
      });

    candidates.sort((a, b) => {
      const area = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width * rect.height;
      };
      const aVideo = a instanceof HTMLVideoElement ? 1 : 0;
      const bVideo = b instanceof HTMLVideoElement ? 1 : 0;
      return (bVideo - aVideo) || (area(b) - area(a));
    });
    return candidates[0] || null;
  }

  function findMediaRegion(media, root) {
    const mediaRect = media.getBoundingClientRect();
    let current = media.parentElement;
    for (let depth = 0; current && current !== root && depth < 6; depth += 1, current = current.parentElement) {
      const rect = current.getBoundingClientRect();
      const fitsMedia = rect.width >= mediaRect.width * 0.9 && rect.height >= mediaRect.height * 0.9 &&
        rect.width <= mediaRect.width * 1.2 && rect.height <= mediaRect.height * 1.2;
      if (fitsMedia) return current;
    }
    return media.parentElement || root;
  }

  function getContexts() {
    const contexts = [];
    const seenRoots = new Set();
    const seenShortcodes = new Set();
    const feedFallbackRoots = getFeedFallbackRoots();
    for (const article of document.querySelectorAll("article")) {
      const context = getArticleContext(article);
      if (!context || seenRoots.has(article)) continue;
      const media = getMainMediaElement(article);
      if (!media) continue;
      seenRoots.add(article);
      if (context.shortcode) seenShortcodes.add(context.shortcode);
      contexts.push({ ...context, media });
    }

    for (const root of feedFallbackRoots) {
      if (seenRoots.has(root) || getPostShortcodes(root).size > 1) continue;
      const media = getMainMediaElement(root);
      if (!media) continue;
      const post = getPostsIn(root)[0] || {};
      if (post.shortcode && seenShortcodes.has(post.shortcode)) continue;
      seenRoots.add(root);
      if (post.shortcode) seenShortcodes.add(post.shortcode);
      contexts.push({ root, shortcode: post.shortcode || "", url: post.url || "", media });
    }

    // Instagram sometimes renders feed cards and post dialogs as generic divs,
    // so discover them from rendered media even when there is no <article>.
    const visibleMedia = [...document.querySelectorAll("video, img")]
      .filter(isVisible)
      .filter((element) => {
        if (element instanceof HTMLVideoElement) return true;
        const descriptor = `${element.alt || ""} ${element.className || ""}`;
        return !/avatar|profile|emoji|icon|logo/i.test(descriptor);
      })
      .sort((a, b) => {
        const area = (element) => {
          const rect = element.getBoundingClientRect();
          return rect.width * rect.height;
        };
        return area(b) - area(a);
      });

    for (const media of visibleMedia) {
      const linked = findPostContextFromMedia(media);
      const root = linked?.root || findFeedFallbackRoot(media, feedFallbackRoots) || findVisualCardRoot(media);
      if (!root || seenRoots.has(root) || (linked?.shortcode && seenShortcodes.has(linked.shortcode))) continue;
      const mainMedia = getMainMediaElement(root);
      if (!mainMedia || !isVisible(mainMedia)) continue;
      seenRoots.add(root);
      if (linked?.shortcode) seenShortcodes.add(linked.shortcode);
      contexts.push({
        root,
        shortcode: linked?.shortcode || "",
        url: linked?.url || "",
        media: mainMedia
      });
    }

    // On a post/reel detail route, the active media can be visible even when
    // Instagram omits a permalink anchor from its dialog markup.
    const activeRoute = parsePostUrl(location.href);
    if (activeRoute && !seenShortcodes.has(activeRoute.shortcode)) {
      const routeRoot = [...document.querySelectorAll("article, [role=article], [role=dialog]")]
        .filter((root) => getPostShortcodes(root).has(activeRoute.shortcode))
        .map((root) => ({ root, media: getMainMediaElement(root) }))
        .find((item) => item.media);
      const fallbackMedia = visibleMedia[0];
      const media = routeRoot?.media || fallbackMedia;
      if (media) {
        const root = routeRoot?.root ||
          findPostContextFromMedia(media, activeRoute.shortcode)?.root ||
          media.closest("[role=dialog], article, [role=article]") || media.parentElement;
        if (root) {
          const existing = contexts.find((item) => item.root === root || item.media === media);
          if (existing) Object.assign(existing, activeRoute, { isActiveRoute: true });
          else contexts.push({ ...activeRoute, root, media, isActiveRoute: true });
        }
      }
    }
    return contexts;
  }

  function scan() {
    const contexts = getContexts();
    const activeRoots = new Set(contexts.map((context) => context.root));
    const hosts = [...document.querySelectorAll(`.${HOST_CLASS}`)];

    for (const context of contexts) {
      const busyHost = hosts.find((host) => host.__igPostRoot === context.root && host.__igBusy);
      if (busyHost) continue;
      const mediaRegion = findMediaRegion(context.media, context.root);
      if (!mediaRegion || !isVisible(mediaRegion)) continue;

      const existing = hosts.find((host) => host.__igPostRoot === context.root);
      if (existing?.dataset.postUrl === context.url) {
        positionButtonHost(existing, mediaRegion);
        updateHostHover(existing);
        continue;
      }
      for (const stale of hosts.filter((host) => host.__igPostRoot === context.root)) removeHost(stale);
      const host = createButtonHost(context, mediaRegion);
      positionButtonHost(host, mediaRegion);
      document.documentElement.appendChild(host);
      updateHostHover(host);
    }

    for (const host of document.querySelectorAll(`.${HOST_CLASS}`)) {
      if (host.__igBusy && host.__igPostRoot?.isConnected) continue;
      if (!host.__igPostRoot?.isConnected || !activeRoots.has(host.__igPostRoot)) removeHost(host);
    }
  }

  function removeHost(host) {
    importActions.delete(host);
    host.remove();
  }

  function positionButtonHost(host, mediaRegion) {
    host.__igMediaRegion = mediaRegion;
    const rect = mediaRegion.getBoundingClientRect();
    // A fixed, root-level control escapes Instagram's transformed/player
    // stacking contexts, which otherwise can sit above an absolutely
    // positioned button and receive the click as a play/pause action.
    const left = Math.max(6, rect.left + 14);
    const top = Math.max(6, rect.top + 14);
    host.style.left = `${Math.min(left, window.innerWidth - 42)}px`;
    host.style.top = `${Math.min(top, window.innerHeight - 42)}px`;
  }

  function updateHostHover(host) {
    const region = host.__igMediaRegion;
    if (!lastPointer || !region?.isConnected) {
      host.removeAttribute("data-hovered");
      return;
    }
    const rect = region.getBoundingClientRect();
    const inside = lastPointer.x >= rect.left && lastPointer.x <= rect.right &&
      lastPointer.y >= rect.top && lastPointer.y <= rect.bottom;
    host.toggleAttribute("data-hovered", inside);
  }

  function updateAllHostHover() {
    for (const host of document.querySelectorAll(`.${HOST_CLASS}`)) updateHostHover(host);
  }

  function handlePointerMove(event) {
    if (event.pointerType === "touch") return;
    lastPointer = { x: event.clientX, y: event.clientY };
    updateAllHostHover();
  }

  function clearPointerHover() {
    lastPointer = null;
    updateAllHostHover();
  }

  function createButtonHost(context, mediaRegion) {
    const host = document.createElement("div");
    host.className = HOST_CLASS;
    host.dataset.postUrl = context.url;
    host.__igPostRoot = context.root;
    host.style.cssText = "position:fixed;top:14px;left:14px;z-index:2147483647;";

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; display:block; opacity:0; visibility:hidden; pointer-events:none; transform:none; }
        :host([data-hovered]), :host([data-status]) { opacity:1; visibility:visible; pointer-events:auto; }
        button { display:grid; place-items:center; width:36px; height:36px; padding:0; border:1px solid rgba(255,255,255,.24); border-radius:11px; color:#fff; background:rgba(18,20,24,.78); box-shadow:0 3px 12px rgba(0,0,0,.28); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); cursor:pointer; }
        button:hover { background:rgba(18,20,24,.94); }
        button:focus-visible { outline:2px solid #fff; outline-offset:2px; }
        button:disabled { cursor:wait; opacity:.75; }
        button[data-state="success"] { border-color:#55d68b; }
        button[data-state="error"] { border-color:#ff7c78; }
        img { display:block; width:21px; height:21px; object-fit:contain; }
        .status { position:absolute; top:0; left:44px; display:none; width:max-content; max-width:min(340px,60vw); padding:9px 12px; border:1px solid rgba(255,255,255,.16); border-radius:9px; color:#fff; background:rgba(18,20,24,.94); box-shadow:0 3px 12px rgba(0,0,0,.25); font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; white-space:normal; overflow-wrap:anywhere; }
        :host([data-status]) .status { display:block; }
        :host([data-result="error"]) .status { border-color:#ff7c78; }
        :host([data-result="success"]) .status { border-color:#55d68b; }
      </style>
      <button type="button" aria-label="导入到 Eagle" title="导入到 Eagle">
        <img alt="" src="${chrome.runtime.getURL("icons/eagle_white.png")}">
      </button>
      <span class="status" role="status" aria-live="polite"></span>`;

    const button = shadow.querySelector("button");
    const status = shadow.querySelector(".status");
    const runImport = async () => {
      if (button.disabled) return;

      button.disabled = true;
      host.__igBusy = true;
      button.dataset.state = "loading";
      button.title = "正在读取帖子媒体和正文…";
      host.dataset.status = "visible";
      host.dataset.result = "loading";
      status.textContent = "正在读取帖子媒体和正文…";
      try {
        const articlePost = context.root.matches?.("article, [role=article]") ? getArticleContext(context.root) : null;
        const rootPost = getPostsIn(context.root)[0] || null;
        const linkedPost = findPostContextFromMedia(context.media);
        const activePost = context.isActiveRoute ? parsePostUrl(location.href) : null;
        const livePost = articlePost?.shortcode ? articlePost :
          (rootPost?.shortcode ? rootPost :
            (linkedPost?.shortcode ? linkedPost : (activePost || context)));
        if (!livePost.shortcode) throw new Error("没能定位这条帖子的原网址；请从帖子详情页重试。");
        const payload = await collectPost(livePost, context.root, mediaRegion);
        status.textContent = `正在导入 ${payload.media.length} 项媒体到 Eagle…`;
        const result = await chrome.runtime.sendMessage({ type: "IMPORT_IG_POST", payload });
        if (result?.ok && !result.error) {
          button.dataset.state = "success";
          button.title = `已导入 ${result.imported} 项到 Eagle`;
          host.dataset.result = "success";
          status.textContent = `已导入 ${result.imported} 项到 Eagle`;
        } else if (result?.ok) {
          button.dataset.state = "error";
          button.title = `部分导入 ${result.imported}/${result.total}：${result.error || "部分媒体失败"}`;
          host.dataset.result = "error";
          status.textContent = button.title;
        } else {
          throw new Error(result?.error || "导入失败，请检查 Eagle 是否运行及扩展设置。");
        }
      } catch (error) {
        button.dataset.state = "error";
        button.title = error?.message || "导入失败";
        host.dataset.result = "error";
        status.textContent = button.title;
      } finally {
        button.disabled = false;
        host.__igBusy = false;
        window.setTimeout(() => {
          if (!button.isConnected) return;
          delete button.dataset.state;
          delete host.dataset.status;
          delete host.dataset.result;
          button.title = "导入到 Eagle";
        }, 8000);
      }
    };
    importActions.set(host, { button, runImport });
    return host;
  }

  function handleImportEvent(event) {
    const path = event.composedPath();
    const host = path.find((node) => node instanceof Element && node.classList.contains(HOST_CLASS));
    const action = host && importActions.get(host);
    if (!action || !path.includes(action.button)) return;
    // Video players handle pointer/click events on their ancestor containers.
    // Catch our own controls before those handlers can consume the event.
    event.stopImmediatePropagation();
    if (event.type === "click") {
      event.preventDefault();
      void action.runImport();
    }
  }

  async function collectPost(post, root, mediaRegion) {
    let postData = null;
    let dataError = "";
    try {
      postData = await fetchPostData(post.shortcode);
    } catch (error) {
      dataError = error?.message || "帖子数据读取失败";
    }
    const report = postData ? IGMedia.inspectMedia(postData) : null;
    const expectedCount = Math.max(report?.expectedCount || 0, getExpectedMediaCount(root));
    const hasCarouselControls = expectedCount > 1 || hasCarouselNavigation(mediaRegion || root);
    let media;
    const unresolvedMedia = [...(report?.missing || [])];

    if (report) {
      media = report.media;
      for (let index = report.expectedCount; index < expectedCount; index += 1) {
        unresolvedMedia.push({ index: index + 1, reason: "帖子数据没有返回这项媒体" });
      }
    } else {
      // DOM URLs alone cannot establish a carousel's complete inventory. A blob
      // video URL is a player buffer, not a downloadable MP4 or an image.
      if (hasCarouselControls) throw new Error(`读取完整图集失败：${dataError || "页面没有提供这条帖子的完整媒体数据"}`);
      media = collectVisibleMedia(root);
      if (root.querySelector("video") && !media.some((item) => item.kind === "video")) {
        throw new Error(`读取视频地址失败：${dataError || "播放器只提供临时 blob 地址"}`);
      }
    }

    if (!media.length) throw new Error(dataError || unresolvedMedia[0]?.reason || "没有读取到可导入的媒体地址。");

    const caption = getCaption(postData) || getCaptionFromDom(root);
    const author = getAuthor(postData) || getAuthorFromDom(root);
    const title = caption.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 100) ||
      ["Instagram", author ? `@${author}` : "", post.shortcode].filter(Boolean).join(" - ");
    const tags = [...caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]);

    return {
      platform: "instagram",
      title,
      author,
      description: caption,
      url: post.url,
      shortcode: post.shortcode,
      tags: [...new Set(tags)],
      media,
      expectedMediaCount: Math.max(expectedCount, media.length + unresolvedMedia.length),
      unresolvedMedia
    };
  }

  async function fetchPostData(shortcode) {
    let best = findEmbeddedPostData(shortcode);
    if (best && IGMedia.inspectMedia(best).complete) return best;

    const appId = findAppId();
    const headers = { Accept: "*/*" };
    if (appId) headers["X-IG-App-ID"] = appId;

    const mediaId = IGMedia.shortcodeToMediaId(shortcode);
    const mediaInfoUrl = new URL(`/api/v1/media/${mediaId}/info/`, location.origin);

    const hashUrl = new URL("/graphql/query/", location.origin);
    hashUrl.searchParams.set("query_hash", QUERY_HASH);
    hashUrl.searchParams.set("variables", JSON.stringify({ shortcode }));

    const queryIdUrl = new URL("/graphql/query/", location.origin);
    queryIdUrl.searchParams.set("query_id", QUERY_ID);
    queryIdUrl.searchParams.set("variables", JSON.stringify({
      shortcode,
      __relay_internal__pv__PolarisFeedShareMenurelayprovider: true,
      __relay_internal__pv__PolarisIsLoggedInrelayprovider: true
    }));

    const failures = [];
    for (const url of [mediaInfoUrl, hashUrl, queryIdUrl]) {
      const abort = new AbortController();
      const timeout = window.setTimeout(() => abort.abort(), 10000);
      try {
        const response = await fetch(url, { credentials: "include", headers, signal: abort.signal });
        if (!response.ok) throw new Error(`Instagram 返回 HTTP ${response.status}`);
        const json = await response.json();
        const post = IGMedia.findPostInJSON(json, shortcode);
        if (post) {
          best = IGMedia.preferPost(best, post);
          if (IGMedia.inspectMedia(best).complete) return best;
          continue;
        }
        if (json?.status === "fail" || json?.errors?.length) throw new Error(json.message || "Instagram 暂未提供帖子媒体数据。");
        throw new Error("Instagram 响应中没有帖子媒体数据。");
      } catch (error) {
        failures.push(error?.message || "请求失败");
      } finally {
        window.clearTimeout(timeout);
      }
    }
    if (best) return best;
    throw new Error(failures.join("；"));
  }

  function findEmbeddedPostData(shortcode) {
    const mediaId = IGMedia.shortcodeToMediaId(shortcode);
    let best = null;
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      const text = script.textContent;
      if (!text.includes(shortcode) && !text.includes(mediaId)) continue;
      try {
        best = IGMedia.preferPost(best, IGMedia.findPostInJSON(JSON.parse(text), shortcode));
      } catch {
        // Other JSON scripts may contain unrelated or incomplete payloads.
      }
    }
    return best;
  }

  function findAppId() {
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      const match = script.textContent.match(/"APP_ID"\s*:\s*"?(\d+)"?/);
      if (match) return match[1];
    }
    return "";
  }

  function collectVisibleMedia(root) {
    const elements = [...root.querySelectorAll("video, img")].filter(isVisible);
    const videos = elements.filter((element) => element instanceof HTMLVideoElement);
    const media = [];
    for (const element of elements) {
      const isVideo = element instanceof HTMLVideoElement;
      if (!isVideo) {
        if (/avatar|profile|emoji|icon|logo/i.test(element.alt || "")) continue;
        const imageRect = element.getBoundingClientRect();
        const isPoster = videos.some((video) => {
          const rect = video.getBoundingClientRect();
          const overlap = Math.max(0, Math.min(rect.right, imageRect.right) - Math.max(rect.left, imageRect.left)) *
            Math.max(0, Math.min(rect.bottom, imageRect.bottom) - Math.max(rect.top, imageRect.top));
          return overlap >= imageRect.width * imageRect.height * 0.8;
        });
        if (isPoster) continue;
      }
      const url = normalizeUrl(element.currentSrc || element.src || (isVideo ? element.querySelector("source[src]")?.src : "") || "");
      if (isInstagramMediaUrl(url)) media.push({ url, kind: isVideo ? "video" : "image" });
    }
    return [...new Map(media.map((item) => [item.url, item])).values()]
      .map((item, index) => ({ ...item, index: index + 1 }));
  }

  function getCaption(post) {
    const caption = post?.edge_media_to_caption?.edges?.[0]?.node?.text ??
      post?.caption?.text ?? post?.caption_text ?? (typeof post?.caption === "string" ? post.caption : "");
    return cleanText(caption);
  }

  function getAuthor(post) {
    return String(post?.owner?.username || post?.user?.username || "").trim();
  }

  function getCaptionFromDom(root) {
    const candidates = [...root.querySelectorAll('h1, span[dir="auto"], div[dir="auto"]')]
      .filter((element) => !element.closest("a, button, time"))
      .map((element) => readText(element))
      .filter((text) => text.length > 1 && text.length < 5000)
      .filter((text) => !/^(like|reply|follow|more|view all comments|see translation|liked by|翻译|回复|赞|关注)$/i.test(text));
    return candidates.sort((a, b) => b.length - a.length)[0] || "";
  }

  function getAuthorFromDom(root) {
    for (const anchor of root.querySelectorAll('header a[href], a[href]')) {
      const href = new URL(anchor.href, location.origin).pathname.split("/").filter(Boolean);
      if (href.length === 1 && !POST_ROUTE_PARTS.has(href[0])) return href[0];
    }
    return "";
  }

  function getExpectedMediaCount(root) {
    let count = 0;
    for (const element of root.querySelectorAll("[aria-label]")) {
      const label = element.getAttribute("aria-label") || "";
      const match = label.match(/\b\d+\s*(?:of|\/)\s*(\d+)\b/i) || label.match(/共\s*(\d+)\s*(?:张|个|项)/);
      const slide = label.match(/go to slide\s+(\d+)/i) || label.match(/(?:转到|前往)第?\s*(\d+)\s*(?:张|个|项)/);
      count = Math.max(count, Number(match?.[1]) || 0, Number(slide?.[1]) || 0);
    }
    return count;
  }

  function hasCarouselNavigation(root) {
    return [...root.querySelectorAll("button[aria-label], [role=button][aria-label]")]
      .some((element) => /next|previous|next photo|next slide|下一张|上一张|下一个|上一个/i.test(element.getAttribute("aria-label") || ""));
  }

  function isInstagramMediaUrl(value) {
    return IGMedia.isMediaUrl(value);
  }

  function normalizeUrl(value) {
    return IGMedia.normalizeUrl(value);
  }

  function cleanText(value) {
    return String(value || "").replace(/\r/g, "").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  function readText(element) {
    return cleanText(element?.innerText || element?.textContent || "");
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 180);
  }

  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    document.addEventListener(type, handleImportEvent, { capture: true });
  }
  document.addEventListener("pointermove", handlePointerMove, { capture: true, passive: true });
  document.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget) clearPointerHover();
  }, { capture: true, passive: true });
  window.addEventListener("blur", clearPointerHover, { passive: true });
  scan();
  // Instagram virtualizes the feed without always changing the DOM while the
  // user scrolls. Rescan after scrolling so newly visible post media gets its
  // own overlay entry.
  document.addEventListener("scroll", scheduleScan, { capture: true, passive: true });
  window.addEventListener("resize", scheduleScan, { passive: true });
  new MutationObserver(scheduleScan).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "src", "class", "style", "aria-label"]
  });
})();
