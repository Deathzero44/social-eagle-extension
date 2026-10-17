(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SocialEagleIGMedia = api;
})(globalThis, () => {
  const MEDIA_HOSTS = ["cdninstagram.com", "fbcdn.net"];
  const SHORTCODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  function normalizeUrl(value) {
    return String(value || "").replace(/&amp;/g, "&").trim();
  }

  function isMediaUrl(value) {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) && MEDIA_HOSTS.some((host) =>
        url.hostname === host || url.hostname.endsWith(`.${host}`));
    } catch {
      return false;
    }
  }

  function shortcodeToMediaId(shortcode) {
    if (!/^[A-Za-z0-9_-]+$/.test(shortcode)) return "";
    let id = 0n;
    for (const character of shortcode) id = id * 64n + BigInt(SHORTCODE_ALPHABET.indexOf(character));
    return id.toString();
  }

  function matchesPost(value, shortcode) {
    if (!value || typeof value !== "object") return false;
    const code = value.code || value.shortcode;
    if (code) return code === shortcode;
    const id = String(value.pk || value.id || "").split("_")[0];
    return Boolean(id && id === shortcodeToMediaId(shortcode));
  }

  function hasMediaFields(value) {
    return Boolean(value && typeof value === "object" && (
      value.edge_sidecar_to_children?.edges?.length || value.carousel_media?.length ||
      value.video_url || value.video_versions?.length || value.video_resources?.length ||
      value.image_versions2?.candidates?.length || value.display_url ||
      value.display_resources?.length || Number(value.media_type) === 2
    ));
  }

  function getMediaNodes(post) {
    const edges = post?.edge_sidecar_to_children?.edges;
    if (Array.isArray(edges) && edges.length) return edges.map((edge) => edge?.node).filter(Boolean);
    if (Array.isArray(post?.carousel_media) && post.carousel_media.length) return post.carousel_media;
    if (Number(post?.media_type) === 8 || post?.__typename === "GraphSidecar") return [];
    return post ? [post] : [];
  }

  function isVideo(item) {
    return Boolean(Number(item?.media_type) === 2 || item?.is_video ||
      item?.__typename === "GraphVideo" || item?.video_url ||
      item?.video_versions?.length || item?.video_resources?.length);
  }

  function bestCandidate(candidates) {
    return candidates
      .map((item) => ({ ...item, url: normalizeUrl(item.url) }))
      .filter((item) => isMediaUrl(item.url))
      .sort((a, b) => (Number(b.width || 0) * Number(b.height || 0) - Number(a.width || 0) * Number(a.height || 0)) ||
        (Number(b.bitrate || 0) - Number(a.bitrate || 0)))[0]?.url || "";
  }

  function chooseVideoUrl(item) {
    const candidates = [];
    if (item.video_url) candidates.push({ url: item.video_url, ...item.dimensions });
    for (const variant of [...(item.video_versions || []), ...(item.video_resources || [])]) {
      candidates.push({
        url: variant?.url || variant?.src,
        width: variant?.width || variant?.config_width,
        height: variant?.height || variant?.config_height,
        bitrate: variant?.bandwidth || variant?.bit_rate || variant?.bitrate
      });
    }
    return bestCandidate(candidates);
  }

  function chooseImageUrl(item) {
    const candidates = (item.image_versions2?.candidates || []).map((variant) => ({ ...variant }));
    for (const variant of item.display_resources || []) {
      candidates.push({ url: variant.src || variant.url, width: variant.config_width || variant.width, height: variant.config_height || variant.height });
    }
    for (const url of [item.display_url, item.thumbnail_src]) if (url) candidates.push({ url });
    return bestCandidate(candidates);
  }

  function inspectMedia(post) {
    const nodes = getMediaNodes(post);
    const expectedCount = Math.max(nodes.length, Number(post?.carousel_media_count) || (Number(post?.media_type) === 8 || post?.__typename === "GraphSidecar" ? 1 : 0));
    const media = [];
    const missing = [];
    const seen = new Set();
    nodes.forEach((node, index) => {
      const kind = isVideo(node) ? "video" : "image";
      const id = String(node.pk || node.id || "").split("_")[0];
      const url = kind === "video" ? chooseVideoUrl(node) : chooseImageUrl(node);
      if (!url) {
        missing.push({ index: index + 1, kind, id, reason: kind === "video" ? "视频没有返回可下载地址" : "图片没有返回可下载地址" });
        return;
      }
      const key = id || `${kind}:${url}`;
      if (seen.has(key)) return;
      seen.add(key);
      media.push({ url, kind, id, index: index + 1 });
    });
    for (let index = nodes.length; index < expectedCount; index += 1) {
      missing.push({ index: index + 1, kind: "unknown", reason: "帖子没有返回这项媒体的数据" });
    }
    return { media, missing, expectedCount, complete: media.length > 0 && missing.length === 0 && media.length === expectedCount };
  }

  function preferPost(first, second) {
    if (!first) return second;
    if (!second) return first;
    const a = inspectMedia(first);
    const b = inspectMedia(second);
    if (a.complete !== b.complete) return b.complete ? second : first;
    if (a.media.length !== b.media.length) return b.media.length > a.media.length ? second : first;
    return b.missing.length < a.missing.length ? second : first;
  }

  function findPostInJSON(json, shortcode) {
    const pending = [json];
    const seen = new Set();
    let best = null;
    while (pending.length && seen.size < 150000) {
      const value = pending.pop();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      if (matchesPost(value, shortcode) && hasMediaFields(value)) best = preferPost(best, value);
      for (const child of Object.values(value)) if (child && typeof child === "object") pending.push(child);
    }
    return best;
  }

  return { normalizeUrl, isMediaUrl, shortcodeToMediaId, matchesPost, inspectMedia, preferPost, findPostInJSON };
});
