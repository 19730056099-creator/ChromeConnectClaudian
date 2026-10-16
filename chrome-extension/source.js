// 来源信息：YouTube 视频页的链接带上当前时间点，标题去掉通知数和站名；其他页面原样返回
// background 通过 importScripts 加载；node 测试通过 require 加载

function youtubeVideoId(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)youtube\.com$/.test(u.hostname) || u.pathname !== "/watch") return null;
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

// seconds：视频当前播放时间（读不到时为 null）。往前留 2 秒，暂停时字幕通常已显示了一会儿
function sourceInfo(url, title, seconds) {
  const id = youtubeVideoId(url);
  if (!id) return { url, title };
  return {
    url: Number.isFinite(seconds) ? `https://youtu.be/${id}?t=${Math.max(0, Math.floor(seconds) - 2)}` : url,
    title: title.replace(/^\(\d+\)\s+/, "").replace(/\s+-\s+YouTube$/, ""),
  };
}

if (typeof module !== "undefined") module.exports = { youtubeVideoId, sourceInfo };
