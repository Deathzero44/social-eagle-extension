(() => {
  const HOST_CLASS = "social-eagle-x-host";
  const GROK_SELECTOR = 'button[aria-label="Grok 操作"],button[aria-label="Grok actions"],button[data-testid="grok-button"]';
  const QUERY_ID_FALLBACK = "GZsN2Pc4knAoit6pXa4HSA";
  const BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  const FEATURES = {
    articles_preview_enabled: true, c9s_tweet_anatomy_moderator_badge_enabled: true,
    communities_web_enable_tweet_community_results_fetch: false,
    creator_subscriptions_quote_tweet_preview_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: false, freedom_of_speech_not_reach_fetch_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    longform_notetweets_consumption_enabled: false, longform_notetweets_inline_media_enabled: true,
    longform_notetweets_rich_text_read_enabled: false, premium_content_api_read_enabled: false,
    profile_label_improvements_pcf_label_in_post_enabled: true, responsive_web_edit_tweet_api_enabled: false,
    responsive_web_enhance_cards_enabled: false, responsive_web_graphql_exclude_directive_enabled: false,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: false, responsive_web_grok_analysis_button_from_backend: false,
    responsive_web_grok_analyze_button_fetch_trends_enabled: false,
    responsive_web_grok_analyze_post_followups_enabled: false, responsive_web_grok_image_annotation_enabled: false,
    responsive_web_grok_share_attachment_enabled: false, responsive_web_grok_show_grok_translated_post: false,
    responsive_web_jetfuel_frame: false, responsive_web_media_download_video_enabled: false,
    responsive_web_twitter_article_tweet_consumption_enabled: true, rweb_tipjar_consumption_enabled: true,
    rweb_video_screen_enabled: false, standardized_nudges_misinfo: true, tweet_awards_web_tipping_enabled: false,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    tweetypie_unmention_optimization_enabled: false, verified_phone_label_enabled: false,
    view_counts_everywhere_api_enabled: true
  };
  const FIELD_TOGGLES = {
    withArticleRichContentState: false, withArticlePlainText: false, withArticleSummaryText: false,
    withArticleVoiceOver: false, withGrokAnalyze: false, withDisallowedReplyControls: false,
    withPayments: false, withAuxiliaryUserLabels: false
  };
  let scanTimer = 0;
  const actions = new WeakMap();

  function statusIdOf(article) {
    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      const match = new URL(link.href, location.origin).pathname.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }
    return "";
  }

  function hasMedia(article) {
    return Boolean(article.querySelector('a[href*="/photo/"],video,[data-testid*="videoPlayer"],[aria-label*="嵌入式视频"],[aria-label*="Embedded video"]'));
  }

  function scan() {
    const active = new Set();
    for (const article of document.querySelectorAll("article")) {
      const grok = article.querySelector(GROK_SELECTOR);
      const id = statusIdOf(article);
      if (!grok || !id || !hasMedia(article)) continue;
      active.add(article);
      let host = [...article.querySelectorAll("." + HOST_CLASS)].find((item) => item.dataset.statusId === id);
      const grokColor = getComputedStyle(grok).color;
      const grokIcon = grok.querySelector("svg");
      const grokIconRect = grokIcon && grokIcon.getBoundingClientRect();
      const grokIconWidth = grokIconRect && grokIconRect.width || 20;
      const grokIconHeight = grokIconRect && grokIconRect.height || 20;
      if (!host) {
        article.querySelectorAll("." + HOST_CLASS).forEach((item) => item.remove());
        host = createHost(article, id, grokColor);
      }
      host.style.color = grokColor;
      host.style.setProperty("--eagle-icon-width", grokIconWidth * 0.9 + "px");
      host.style.setProperty("--eagle-icon-height", grokIconHeight * 0.9 + "px");
      const grokWrapper = grok.parentElement;
      const parent = grokWrapper && grokWrapper.parentElement || grokWrapper;
      const anchor = grokWrapper || grok;
      if (parent && host.parentElement !== parent) {
        host.remove();
        host.style.color = grokColor;
        parent.insertBefore(host, anchor);
      } else if (parent && host.nextElementSibling !== anchor) {
        parent.insertBefore(host, anchor);
      }
    }
    document.querySelectorAll("article ." + HOST_CLASS).forEach((host) => {
      if (!active.has(host.closest("article"))) host.remove();
    });
  }

  function createHost(article, id, color) {
    const host = document.createElement("span");
    host.className = HOST_CLASS;
    host.dataset.statusId = id;
    host.style.cssText = "display:inline-flex;flex:0 0 32px;width:32px;height:32px;align-items:center;justify-content:center;position:relative;z-index:2;vertical-align:middle;color:" + color + ";";
    const shadow = host.attachShadow({ mode: "open" });
    const eagleSvgUrl = chrome.runtime.getURL("icons/eagle-x.svg");
    shadow.innerHTML =
      '<style>' +
      ':host{all:initial;display:inline-flex;width:32px;height:32px;flex:0 0 32px;color:inherit;font:inherit}' +
      'button{all:unset;box-sizing:border-box;display:flex;width:32px;height:32px;align-items:center;justify-content:center;border-radius:9999px;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      'button:hover{background:color-mix(in srgb,currentColor 10%,transparent)}button:active{background:color-mix(in srgb,currentColor 18%,transparent)}' +
      'button:focus-visible{outline:2px solid #1d9bf0;outline-offset:1px}button:disabled{cursor:wait;opacity:.65}' +
      '.eagle-mark{display:block;width:var(--eagle-icon-width,18px);height:var(--eagle-icon-height,18px);object-fit:contain;flex:none;opacity:.5}' +
      ':host([data-state="loading"]) .eagle-mark{animation:spin .9s linear infinite}' +
      ':host([data-state="success"]) button{box-shadow:inset 0 0 0 2px #00a86b}:host([data-state="error"]) button{box-shadow:inset 0 0 0 2px #e0245e}' +
      '@keyframes spin{to{transform:rotate(360deg)}}' +
      '</style><button type="button" aria-label="导入到 Eagle" title="导入到 Eagle">' +
      '<img class="eagle-mark" alt="" src="' + eagleSvgUrl + '"></button>';
    actions.set(host, { button: shadow.querySelector("button"), article, id, busy: false });
    return host;
  }

  async function runImport(host) {
    const action = actions.get(host);
    if (!action || action.busy) return;
    action.busy = true;
    action.button.disabled = true;
    action.button.title = "正在读取推文媒体和正文…";
    host.dataset.state = "loading";
    try {
      const article = host.closest("article");
      if (!article || !article.isConnected) throw new Error("这条推文已经从信息流中移除，请稍后重试。");
      const payload = await collectPost(article, action.id);
      const result = await chrome.runtime.sendMessage({ type: "IMPORT_X_POST", payload });
      if (!result || !result.ok) throw new Error(result && result.error || "导入失败，请检查 Eagle 是否运行及扩展设置。");
      host.dataset.state = "success";
      action.button.title = result.error
        ? "部分导入 " + result.imported + "/" + result.total + "：" + result.error
        : "已导入 " + result.imported + " 项到 Eagle";
      action.button.setAttribute("aria-label", action.button.title);
    } catch (error) {
      host.dataset.state = "error";
      action.button.title = error && error.message || "导入失败";
      action.button.setAttribute("aria-label", action.button.title);
    } finally {
      action.busy = false;
      action.button.disabled = false;
      window.setTimeout(() => {
        if (!host.isConnected) return;
        delete host.dataset.state;
        action.button.title = "导入到 Eagle";
        action.button.setAttribute("aria-label", "导入到 Eagle");
      }, 8000);
    }
  }

  async function collectPost(article, id) {
    let node = null;
    let apiError = "";
    try {
      node = await fetchTweetNode(id);
    } catch (error) {
      apiError = error && error.message || "X 推文数据读取失败";
    }
    if (!node) node = findTweetInReact(article, id);
    const post = unwrapTweet(node);
    const legacy = post && (post.legacy || post) || {};
    let media = post ? extractMedia(legacy) : emptyMedia();

    if (!media.media.length && !media.unresolved.length && post) {
      const related = [legacy.quoted_status_result && legacy.quoted_status_result.result,
        legacy.retweeted_status_result && legacy.retweeted_status_result.result].map(unwrapTweet).filter(Boolean);
      for (const item of related) {
        const candidate = extractMedia(item.legacy || item);
        if (candidate.media.length || candidate.unresolved.length) {
          media = candidate;
          break;
        }
      }
    }
    if (!media.media.length) {
      const visible = collectVisibleMedia(article, id);
      if (visible.media.length) media = visible;
    }
    if (!media.media.length) {
      const hasVideo = Boolean(article.querySelector("video,[data-testid*='videoPlayer'],[aria-label*='嵌入式视频'],[aria-label*='Embedded video']"));
      if (hasVideo) {
        throw new Error("没有读取到可下载的视频地址" + (apiError ? "：" + apiError : "") +
          "。X 播放器里的 blob 地址是临时流，不能作为视频文件导入；请刷新页面后重试。");
      }
      throw new Error(apiError || media.unresolved[0] && media.unresolved[0].reason || "没有找到可导入的推文图片或视频。");
    }

    const text = tweetText(legacy, post) || visibleTweetText(article);
    const author = tweetAuthor(post) || authorFromArticle(article, id);
    const url = permalinkFromArticle(article, id, author);
    const title = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 100) || "X 帖子";
    return {
      platform: "x", title, author, description: text, url,
      media: media.media.map((item, index) => Object.assign({}, item, { index: item.index || index + 1 })),
      expectedMediaCount: Math.max(media.expected, media.media.length + media.unresolved.length),
      unresolvedMedia: media.unresolved
    };
  }

  function emptyMedia() { return { media: [], unresolved: [], expected: 0 }; }

  function extractMedia(tweet) {
    const candidates = [tweet.extended_entities && tweet.extended_entities.media,
      tweet.entities && tweet.entities.media];
    const nodes = candidates.find((value) => Array.isArray(value) && value.length) || [];
    const media = [];
    const unresolved = [];
    nodes.forEach((item, index) => {
      const kind = item.type === "photo" ? "image" : "video";
      const url = kind === "image" ? originalImageUrl(item.media_url_https || item.media_url) : bestVideoUrl(item);
      if (url && isMediaUrl(url, kind)) media.push({ url, kind, index: index + 1 });
      else unresolved.push({ index: index + 1, reason: kind === "video" ? "推文没有返回可下载的 MP4 视频地址" : "推文没有返回原图地址" });
    });
    return { media: uniqueMedia(media), unresolved, expected: nodes.length };
  }

  function originalImageUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value);
      if (url.hostname !== "pbs.twimg.com") return "";
      const extension = url.pathname.match(/\.(jpg|jpeg|png|webp)$/i);
      url.searchParams.set("format", extension && extension[1].toLowerCase() === "png" ? "png" : "jpg");
      url.searchParams.set("name", "orig");
      return url.href;
    } catch { return ""; }
  }

  function bestVideoUrl(media) {
    const info = media.video_info || media.ext_tw_video_info || {};
    const variants = Array.isArray(info.variants) ? info.variants : [];
    return variants.filter((item) => String(item.content_type || "").toLowerCase() === "video/mp4")
      .filter((item) => isMediaUrl(item.url, "video"))
      .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0))[0]?.url || "";
  }

  function collectVisibleMedia(article, id) {
    const links = [...article.querySelectorAll('a[href*="/photo/"]')];
    const own = links.filter((link) => new URL(link.href, location.origin).pathname.match(/\/status\/(\d+)\/photo\//)?.[1] === id);
    const selected = own.length ? own : links;
    const media = [];
    selected.forEach((link, index) => {
      const image = link.querySelector("img");
      const url = originalImageUrl(image && (image.currentSrc || image.src || image.getAttribute("src")));
      if (url) media.push({ url, kind: "image", index: index + 1 });
    });
    for (const video of article.querySelectorAll("video")) {
      const value = video.currentSrc || video.src || video.querySelector("source[src]")?.src || "";
      if (isMediaUrl(value, "video")) media.push({ url: value, kind: "video", index: media.length + 1 });
    }
    return { media: uniqueMedia(media), unresolved: [], expected: selected.length + article.querySelectorAll("video").length };
  }

  async function fetchTweetNode(id) {
    const variables = { tweetId: String(id), withCommunity: false, includePromotedContent: false, withVoice: false };
    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(FEATURES),
      fieldToggles: JSON.stringify(FIELD_TOGGLES)
    });
    const operationIds = [...new Set([observedOperationId(), QUERY_ID_FALLBACK].filter(Boolean))];
    let lastError = null;
    for (const operationId of operationIds) {
      try {
        const json = await fetchGraphQL("/i/api/graphql/" + encodeURIComponent(operationId) +
          "/TweetResultByRestId?" + params.toString());
        if (json && json.errors && json.errors.length) throw new Error("X 推文接口未返回完整媒体数据");
        const result = json && json.data &&
          (json.data.tweetResult?.result || json.data.tweet_result?.result || json.data.tweetResult || json.data.tweet_result);
        const tweet = unwrapTweet(result);
        if (tweet) return tweet;
        throw new Error("X 推文接口响应中没有找到帖子");
      } catch (error) {
        lastError = error;
      }
    }
    const timelineTweet = await findTweetInObservedTimeline(id).catch((error) => {
      lastError = error || lastError;
      return null;
    });
    if (timelineTweet) return timelineTweet;
    throw lastError || new Error("X 推文数据不可用");
  }

  async function fetchGraphQL(url) {
    const headers = {
      authorization: "Bearer " + BEARER,
      "x-twitter-active-user": "yes",
      "x-twitter-client-language": (document.documentElement.lang || "zh-cn").toLowerCase()
    };
    const csrf = readCookie("ct0");
    if (csrf) headers["x-csrf-token"] = csrf;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { credentials: "include", headers, signal: controller.signal });
      if (!response.ok) throw new Error("X 推文接口返回 HTTP " + response.status);
      return await response.json();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function findTweetInObservedTimeline(id) {
    let entries;
    try { entries = performance.getEntriesByType("resource"); } catch { return null; }
    const candidates = [];
    for (let index = entries.length - 1; index >= 0 && candidates.length < 4; index -= 1) {
      const rawUrl = String(entries[index].name || "");
      const match = rawUrl.match(/\/i\/api\/graphql\/([^/?]+)\/([^?]+)/);
      if (!match) continue;
      let operation = "";
      try { operation = decodeURIComponent(match[2]); } catch { operation = match[2]; }
      if (!/(?:Timeline|Bookmarks|Likes|UserMedia|UserTweets|Search)/i.test(operation)) continue;
      try {
        const url = new URL(rawUrl);
        if (url.origin === location.origin && !candidates.includes(url.href)) candidates.push(url.href);
      } catch { /* Ignore malformed resource entries. */ }
    }
    for (const url of candidates) {
      try {
        const json = await fetchGraphQL(url);
        const tweet = findTweetInJSON(json, id);
        if (tweet) return tweet;
      } catch { /* Try the next observed page request. */ }
    }
    return null;
  }

  function findTweetInJSON(json, id) {
    const pending = [json];
    const seen = new Set();
    let count = 0;
    while (pending.length && count < 150000) {
      const value = pending.pop();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      count += 1;
      const valueId = String(value.rest_id || value.legacy?.id_str || value.id_str || "");
      if (valueId === id && (value.legacy || value.extended_entities || value.entities)) return value;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child === "object") pending.push(child);
      } else {
        for (const child of Object.values(value)) if (child && typeof child === "object") pending.push(child);
      }
    }
    return null;
  }

  function observedOperationId() {
    try {
      const entries = performance.getEntriesByType("resource");
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const match = String(entries[i].name || "").match(/\/i\/api\/graphql\/([^/?]+)\/TweetResultByRestId(?:\?|$)/);
        if (match) return match[1];
      }
    } catch { /* Resource timing may be restricted. */ }
    return "";
  }

  function findTweetInReact(root, id) {
    const queue = [];
    for (const element of [root, ...root.querySelectorAll("*")]) {
      for (const key of Object.getOwnPropertyNames(element)) {
        if (key.startsWith("__reactProps$") || key.startsWith("__reactFiber$")) {
          try { queue.push(element[key]); } catch { /* Ignore inaccessible expandos. */ }
        }
      }
    }
    const seen = new Set();
    let count = 0;
    while (queue.length && count < 25000) {
      const value = queue.pop();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      count += 1;
      const valueId = String(value.rest_id || value.legacy?.id_str || value.id_str || "");
      if (valueId === id && (value.legacy || value.extended_entities || value.entities)) return value;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child === "object") queue.push(child);
      } else {
        for (const key of ["memoizedProps", "pendingProps", "props", "children", "legacy", "tweet", "result",
          "tweet_results", "itemContent", "quoted_status_result", "retweeted_status_result", "child", "sibling"]) {
          const child = value[key];
          if (child && typeof child === "object") queue.push(child);
        }
      }
    }
    return null;
  }

  function unwrapTweet(node, depth) {
    if (!node || typeof node !== "object" || (depth || 0) > 8) return null;
    if (node.legacy || node.extended_entities || node.entities || node.note_tweet) return node;
    for (const candidate of [node.tweet, node.result, node.data, node.tweet_results?.result, node.tweetResult?.result]) {
      const found = unwrapTweet(candidate, (depth || 0) + 1);
      if (found) return found;
    }
    return null;
  }

  function tweetText(legacy, node) {
    const note = node?.note_tweet?.note_tweet_results?.result?.text ||
      legacy?.note_tweet?.note_tweet_results?.result?.text || node?.note_tweet?.text || "";
    return cleanText(note || legacy.full_text || node?.full_text || "");
  }

  function tweetAuthor(node) {
    const user = node?.core?.user_results?.result?.legacy || node?.core?.user_results?.result ||
      node?.user_results?.result?.legacy || node?.user || {};
    return String(user.screen_name || user.username || "").replace(/^@/, "").trim();
  }

  function visibleTweetText(article) {
    const text = article.querySelector('[data-testid="tweetText"]');
    return cleanText(text && (text.innerText || text.textContent));
  }

  function authorFromArticle(article, id) {
    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      const match = new URL(link.href, location.origin).pathname.match(/^\/([^/]+)\/status\/(\d+)/);
      if (match && match[2] === id) return match[1];
    }
    return "";
  }

  function permalinkFromArticle(article, id, author) {
    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      const url = new URL(link.href, location.origin);
      if (url.pathname.match(/\/status\/(\d+)/)?.[1] === id) {
        const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
        if (match) url.pathname = "/" + match[1] + "/status/" + match[2];
        url.search = "";
        url.hash = "";
        return url.href;
      }
    }
    return location.origin + "/" + (author || "i/web") + "/status/" + id;
  }

  function cleanText(value) {
    return String(value || "").replace(/\r/g, "").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  function readCookie(name) {
    const start = name + "=";
    const cookie = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(start));
    return cookie ? decodeURIComponent(cookie.slice(start.length)) : "";
  }

  function isMediaUrl(value, kind) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return false;
      return kind === "image" ? url.hostname === "pbs.twimg.com" : url.hostname === "video.twimg.com";
    } catch { return false; }
  }

  function uniqueMedia(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (!item || !item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }

  function handleImportEvent(event) {
    const path = event.composedPath();
    const host = path.find((node) => node instanceof Element && node.classList?.contains(HOST_CLASS));
    const action = host && actions.get(host);
    if (!action || !path.includes(action.button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") void runImport(host);
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 160);
  }

  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    document.addEventListener(type, handleImportEvent, { capture: true });
  }
  scan();
  document.addEventListener("scroll", scheduleScan, { capture: true, passive: true });
  window.addEventListener("resize", scheduleScan, { passive: true });
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["href", "src", "class", "style", "aria-label"]
  });
})();
