# YouTube 字幕支持 设计

## 目标
在 Chromium 浏览器中，YouTube 视频的字幕可以框选，选中后右键使用「发送到 Claudian 记笔记」，流程与普通网页一致。

## 问题
1. 播放器内右键弹出的是 YouTube 自己的菜单，Chrome 原生菜单（扩展入口）不出现；
2. 字幕框可拖动，按下鼠标是拖动而不是选字；
3. 字幕不断更新，选区会消失。

## 方案：内容脚本改造原生字幕
新增 `chrome-extension/youtube.js`、`youtube.css`，仅注入 `https://www.youtube.com/*`。

- CSS：`.ytp-caption-segment` 可选中（`user-select: text`、`cursor: text`）。
- 捕获阶段拦截字幕区域（`.caption-window` 内）的 `mousedown` / `click` / `dblclick`：`stopPropagation`，不 `preventDefault`，保证浏览器原生选字。
- 捕获阶段拦截字幕区域的 `contextmenu`：`stopImmediatePropagation`，让 Chrome 原生菜单出现。
- 悬停暂停：鼠标进入字幕区且视频在播放 → 暂停并记为“由我们暂停”。鼠标离开时：若字幕内无选区 → 恢复播放；若有选区 → 保持暂停，由用户自行恢复。

## 来源时间点（background.js）
- 菜单点击时，若 tab URL 为 `youtube.com/watch?v=<id>`，用 `chrome.scripting.executeScript` 读取 `video.currentTime`，`{{url}}` = `https://youtu.be/<id>?t=<max(0, floor(t) - 2)>`。读取失败则回退原 URL。
- `{{title}}` 去掉前缀 `(n) ` 与后缀 ` - YouTube`。
- 选词面板路径：上述 title/url 随 opts 传入 picker，并在 `claudian-pick` 消息中带回，background 优先使用消息里的值。
- URL/标题处理写成纯函数（`defaults.js` 中），可用 node 测试。

## 其他
- manifest 增加 `content_scripts`，版本 0.4.0；README 增加 YouTube 说明。
- 不在范围：其他网站嵌入的 YouTube 播放器、Shorts。

## 验证
- node 测试纯函数：时间点链接、标题清理、非 YouTube URL 原样返回。
- 手动检查：框选不拖动字幕框、右键出 Chrome 菜单、悬停暂停/离开恢复、有选区时保持暂停、全屏下可用、单词笔记选词面板正常、来源链接带时间点。
