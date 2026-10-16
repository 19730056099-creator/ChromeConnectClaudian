# YouTube 字幕支持 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YouTube 字幕可框选并通过 Chrome 原生右键菜单发送到 Claudian，来源链接带视频时间点。

**Architecture:** 新增仅在 youtube.com 运行的内容脚本，捕获阶段拦截字幕区域的鼠标/右键事件，使浏览器原生选字与右键菜单生效，并做悬停暂停。来源处理（时间点链接、标题清理）放在纯函数文件 `source.js`，由 background 在菜单点击时调用。

**Tech Stack:** Chrome MV3 扩展（原生 JS），node:test 测试纯函数。

Spec: `docs/superpowers/specs/2026-10-16-youtube-captions-design.md`

---

### Task 1: 来源处理纯函数 `source.js`

**Files:**
- Create: `chrome-extension/source.js`
- Test: `tests/source.test.js`

- [ ] **Step 1: 写失败测试**

```js
const test = require("node:test");
const assert = require("node:assert");
const { sourceInfo } = require("../chrome-extension/source.js");

test("YouTube 视频：链接带时间点（往前留 2 秒），标题去掉通知数和站名", () => {
  assert.deepStrictEqual(
    sourceInfo("https://www.youtube.com/watch?v=abc123&list=x", "(3) Lecture 1 - YouTube", 754.8),
    { url: "https://youtu.be/abc123?t=752", title: "Lecture 1" }
  );
});

test("时间点不会小于 0", () => {
  assert.strictEqual(sourceInfo("https://www.youtube.com/watch?v=abc", "t", 1.2).url, "https://youtu.be/abc?t=0");
});

test("读不到播放时间时保留原链接，仍清理标题", () => {
  assert.deepStrictEqual(
    sourceInfo("https://www.youtube.com/watch?v=abc", "Talk - YouTube", null),
    { url: "https://www.youtube.com/watch?v=abc", title: "Talk" }
  );
});

test("非 YouTube 视频页原样返回", () => {
  assert.deepStrictEqual(sourceInfo("https://example.com/(1)", "(1) Inbox - YouTube", 10), {
    url: "https://example.com/(1)",
    title: "(1) Inbox - YouTube",
  });
  assert.deepStrictEqual(sourceInfo("https://www.youtube.com/results?q=a", "(2) a - YouTube", 10), {
    url: "https://www.youtube.com/results?q=a",
    title: "(2) a - YouTube",
  });
  assert.deepStrictEqual(sourceInfo("", "", null), { url: "", title: "" });
});
```

- [ ] **Step 2: 运行确认失败** — `node --test tests/*.test.js` → FAIL（找不到 source.js）

- [ ] **Step 3: 实现**

```js
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
```

- [ ] **Step 4: 运行确认通过** — `node --test tests/*.test.js` → 4 pass
- [ ] **Step 5: 提交** — `git add chrome-extension/source.js tests && git commit -m "feat: source info with YouTube timestamp"`

### Task 2: background / picker 使用来源信息

**Files:**
- Modify: `chrome-extension/background.js`（importScripts、新增 `pageSource`、菜单点击、`showPicker`、`claudian-pick`）
- Modify: `chrome-extension/picker.js:182`（消息带回 title/url）

- [ ] **Step 1:** `importScripts("defaults.js");` 后加 `importScripts("source.js");`
- [ ] **Step 2:** 在 `findMode` 后新增：

```js
// 菜单点击那一刻的来源；YouTube 视频页读取当前播放时间，生成带时间点的链接
async function pageSource(tab, info) {
  const url = tab?.url || info.pageUrl || "";
  let seconds = null;
  if (tab?.id && youtubeVideoId(url)) {
    try {
      const [r] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => (document.querySelector("#movie_player video") || document.querySelector("video"))?.currentTime,
      });
      seconds = r?.result ?? null;
    } catch {}
  }
  return sourceInfo(url, tab?.title || "", seconds);
}
```

- [ ] **Step 3:** `onClicked` 中 `const mode = ...` 判空后加 `const source = await pageSource(tab, info);`；`showPicker(tab, info, mode, target, text, source)`；直接发送改为 `send(mode, { text, word: text, ...source }, target)`。
- [ ] **Step 4:** `showPicker` 签名加 `source`，args 中加 `title: source.title, url: source.url`。
- [ ] **Step 5:** picker.js 发送消息加 `title: opts.title, url: opts.url`；background `claudian-pick` 中 `title: msg.title ?? sender.tab?.title ?? ""`，`url: msg.url ?? sender.tab?.url ?? ""`。
- [ ] **Step 6:** `node --check chrome-extension/background.js chrome-extension/picker.js`，提交。

### Task 3: YouTube 内容脚本

**Files:**
- Create: `chrome-extension/youtube.js`, `chrome-extension/youtube.css`
- Modify: `chrome-extension/manifest.json`

- [ ] **Step 1: youtube.css**

```css
/* YouTube 字幕可框选（扩展内容样式，见 youtube.js） */
.ytp-caption-window-container .caption-window,
.ytp-caption-window-container .ytp-caption-segment {
  -webkit-user-select: text !important;
  user-select: text !important;
  cursor: text !important;
}
```

- [ ] **Step 2: youtube.js**

```js
// YouTube 字幕：可框选、右键弹出 Chrome 原生菜单（含「发送到 Claudian」）、鼠标悬停时暂停
(() => {
  const CAPTION = ".ytp-caption-window-container .caption-window";
  const captionOf = (node) => (node?.nodeType === 1 ? node : node?.parentElement)?.closest(CAPTION);
  const video = () => document.querySelector("#movie_player video");

  // 捕获阶段拦住 YouTube 的拖动字幕框、单击暂停、双击全屏和自定义右键菜单；
  // 不 preventDefault，浏览器照常选字、弹出原生右键菜单
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "contextmenu"]) {
    window.addEventListener(type, (e) => captionOf(e.target) && e.stopImmediatePropagation(), true);
  }

  const hasCaptionSelection = () => {
    const s = getSelection();
    return !!s && !s.isCollapsed && !!captionOf(s.anchorNode);
  };

  // 悬停暂停：只是路过就在离开时继续播放；选中了文字则保持暂停，由用户自己恢复
  let hovering = false;
  let pausedByUs = false;
  document.addEventListener("mouseover", (e) => {
    const over = !!captionOf(e.target);
    if (over === hovering) return;
    hovering = over;
    const v = video();
    if (!v) return;
    if (over) {
      if (!v.paused) {
        v.pause();
        pausedByUs = true;
      }
    } else if (pausedByUs) {
      pausedByUs = false;
      if (!hasCaptionSelection()) v.play();
    }
  }, true);
})();
```

- [ ] **Step 3: manifest** — version `0.4.0`，加：

```json
"content_scripts": [
  {
    "matches": ["https://www.youtube.com/*"],
    "js": ["youtube.js"],
    "css": ["youtube.css"],
    "run_at": "document_start"
  }
],
```

- [ ] **Step 4:** `node --check chrome-extension/youtube.js`，校验 manifest JSON，提交。

### Task 4: README 与手动验证

- [ ] **Step 1:** README「使用」中增加 YouTube 字幕小节。
- [ ] **Step 2:** 在扩展页刷新扩展、刷新 YouTube 页面，按检查清单验证：框选不拖动字幕框；右键出 Chrome 菜单；悬停暂停 / 离开恢复；有选区保持暂停；全屏可用；单词笔记选词面板；来源链接带 `?t=`。
- [ ] **Step 3:** 提交。
