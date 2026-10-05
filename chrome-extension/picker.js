// 选词面板：注入到网页中（扩展隔离环境），由 background.js 调用 claudianShowPicker(opts)
// 把选中的句子拆成可点击的词：单击切换选中（可多选），Shift+单击选一段，也可直接在输入框里改。
// 确认后通过 runtime 消息交给 background 发送。

globalThis.claudianShowPicker = function (opts) {
  document.getElementById("claudian-word-picker")?.remove();

  const host = document.createElement("div");
  host.id = "claudian-word-picker";
  host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      /* 温润极简：纸张底色 + 细噪点，硬朗细边框，小圆角，克制用色 */
      :host {
        --paper: #f3efe6; --card: #fbf9f4; --field: #fffdf8; --ink: #2b2925; --ink-soft: #57524a;
        --muted: #8a8478; --line: #2b2925; --line-soft: #d9d3c6; --hover: #ebe4d5; --grain: .07;
        --shadow: 0 1px 0 rgba(43,41,37,.06), 0 24px 48px -20px rgba(70,55,30,.45);
      }
      @media (prefers-color-scheme: dark) {
        :host {
          --paper: #1d1b18; --card: #262420; --field: #2c2a25; --ink: #ece6d8; --ink-soft: #c6bfb0;
          --muted: #8f887b; --line: #d8d1c2; --line-soft: #48443c; --hover: #34302a; --grain: .05;
          --shadow: 0 1px 0 rgba(0,0,0,.3), 0 24px 48px -20px rgba(0,0,0,.8);
        }
      }
      * { box-sizing: border-box; }
      .mask { position: fixed; inset: 0; background: rgba(40,34,24,.28); backdrop-filter: blur(1.5px); animation: fade .15s ease-out; }
      .panel {
        position: fixed; top: 14vh; left: 50%; transform: translateX(-50%);
        width: min(580px, calc(100vw - 32px)); max-height: 72vh; overflow: auto;
        background: var(--card); color: var(--ink);
        border: 2px solid var(--line); border-radius: 3px; box-shadow: var(--shadow);
        font: 14px/1.6 "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
        text-align: left; letter-spacing: normal; animation: rise .18s ease-out;
      }
      .panel::before {
        content: ""; position: absolute; inset: 0; pointer-events: none; opacity: var(--grain);
        background-image:
          url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"),
          repeating-linear-gradient(0deg, rgba(0,0,0,.35) 0 1px, transparent 1px 4px);
      }
      @keyframes fade { from { opacity: 0; } }
      @keyframes rise { from { opacity: 0; transform: translate(-50%, 8px); } }

      .head { position: relative; display: flex; align-items: center; gap: 8px; padding: 12px 14px 12px 18px; border-bottom: 1px solid var(--line-soft); }
      .mode { font-weight: 600; font-size: 14px; }
      .arrow { color: var(--muted); }
      .target { font-size: 12px; padding: 0 8px; border: 1px solid var(--line-soft); border-radius: 2px; color: var(--ink-soft); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .close { margin-left: auto; width: 28px; height: 28px; padding: 0; font-size: 16px; line-height: 1; border-color: transparent; box-shadow: none; color: var(--muted); }
      .close:hover { color: var(--ink); border-color: var(--line-soft); }

      .body { position: relative; padding: 16px 18px 6px; }
      .label { font-size: 11px; font-weight: 600; letter-spacing: .08em; color: var(--muted); margin-bottom: 6px; }
      .sentence {
        font: 18px/2.1 Georgia, "Times New Roman", "Songti SC", "SimSun", serif; color: var(--ink);
        padding: 10px 12px; background: var(--field); border: 1px solid var(--line-soft); border-radius: 2px;
        user-select: none; word-break: break-word;
      }
      .w { cursor: pointer; padding: 2px 3px; margin: 0 -1px; border-radius: 2px; border-bottom: 1px dashed transparent; transition: background .12s, color .12s; }
      .w:hover { background: var(--hover); border-bottom-color: var(--muted); }
      .w.on { background: var(--ink); color: var(--paper); border-bottom-color: transparent; }
      .hint { font-size: 12px; color: var(--muted); margin: 8px 0 0; }
      .hint kbd { font: 11px Consolas, monospace; padding: 0 4px; border: 1px solid var(--line-soft); border-bottom-width: 2px; border-radius: 2px; background: var(--field); color: var(--ink-soft); }

      .foot { position: relative; padding: 12px 18px 16px; }
      .row { display: flex; gap: 8px; align-items: center; }
      input {
        flex: 1; min-width: 0; padding: 7px 10px; font: inherit; color: var(--ink);
        background: var(--field); border: 1px solid var(--line-soft); border-radius: 2px;
      }
      input:focus { outline: none; border-color: var(--line); box-shadow: 0 0 0 3px rgba(120,105,75,.14); }
      input::placeholder { color: var(--muted); }
      button {
        font: inherit; font-size: 13px; padding: 6px 14px; cursor: pointer; color: var(--ink);
        background: var(--card); border: 1.5px solid var(--line); border-radius: 2px; box-shadow: 0 1px 0 var(--line-soft);
      }
      button:hover { background: var(--hover); }
      button:active { transform: translateY(1px); box-shadow: none; }
      button.primary { background: var(--ink); color: var(--paper); }
      button.primary:hover { background: var(--ink-soft); }
      button:disabled { opacity: .4; cursor: default; transform: none; }
      .count { font-size: 12px; color: var(--muted); margin-top: 6px; min-height: 1.6em; }
    </style>
    <div class="mask"></div>
    <div class="panel" role="dialog" aria-label="选择要做笔记的单词">
      <div class="head">
        <span class="mode"></span><span class="arrow">→</span><span class="target"></span>
        <button class="close" title="取消 (Esc)">✕</button>
      </div>
      <div class="body">
        <div class="label">选择单词</div>
        <div class="sentence"></div>
        <p class="hint">单击选择 / 取消，可多选，相邻的词合并为短语 · <kbd>Shift</kbd>+单击选一段</p>
      </div>
      <div class="foot">
        <div class="row">
          <input class="word" placeholder="要做笔记的单词 / 短语，多个用逗号分隔">
          <button class="cancel">取消</button>
          <button class="primary send" disabled>发送 ↵</button>
        </div>
        <div class="count"></div>
      </div>
    </div>`;

  root.querySelector(".mode").textContent = opts.modeName;
  root.querySelector(".target").textContent = opts.targetName;
  const sentenceEl = root.querySelector(".sentence");
  const input = root.querySelector(".word");
  const sendBtn = root.querySelector(".send");
  const countEl = root.querySelector(".count");

  // 拆词：汉字逐字、其他字母数字连续成词（含 ' ’ -），其余原样保留
  const parts = opts.text.match(/\p{Script=Han}|(?:(?!\p{Script=Han})[\p{L}\p{N}'’-])+|[^\p{L}\p{N}]+/gu) || [];
  const words = [];
  for (const p of parts) {
    if (/[\p{L}\p{N}]/u.test(p)) {
      const span = document.createElement("span");
      span.className = "w";
      span.textContent = p;
      span.dataset.i = words.length;
      words.push(span);
      sentenceEl.append(span);
    } else {
      sentenceEl.append(p);
    }
  }

  // 多选：单击切换单个词，Shift+单击把一段连续的词都选上；相邻的选中词合并成短语
  const picked = new Set();
  let anchor = null;
  function update() {
    words.forEach((w, i) => w.classList.toggle("on", picked.has(i)));
    const items = [];
    const sorted = [...picked].sort((x, y) => x - y);
    for (let k = 0; k < sorted.length; k++) {
      const start = sorted[k];
      while (k + 1 < sorted.length && sorted[k + 1] === sorted[k] + 1) k++;
      // 用原文中的片段，保留词间的空格/连字符
      const range = document.createRange();
      range.setStartBefore(words[start]);
      range.setEndAfter(words[sorted[k]]);
      items.push(range.toString().replace(/\s+/g, " ").trim());
    }
    input.value = items.join(", ");
    sendBtn.disabled = !items.length;
    countEl.textContent = items.length ? `已选 ${items.length} 项` : "";
  }

  sentenceEl.addEventListener("click", (e) => {
    const w = e.target.closest(".w");
    if (!w) return;
    const i = Number(w.dataset.i);
    if (e.shiftKey && anchor !== null) {
      for (let k = Math.min(anchor, i); k <= Math.max(anchor, i); k++) picked.add(k);
    } else if (picked.has(i)) {
      picked.delete(i);
    } else {
      picked.add(i);
    }
    anchor = i;
    update();
  });

  input.addEventListener("input", () => {
    picked.clear();
    words.forEach((w) => w.classList.remove("on"));
    anchor = null;
    const n = input.value.split(/[,，]/).filter((x) => x.trim()).length;
    sendBtn.disabled = !n;
    countEl.textContent = n ? `已选 ${n} 项` : "";
  });

  const close = () => {
    host.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const send = () => {
    const word = input.value.trim();
    if (!word) return;
    chrome.runtime.sendMessage({ type: "claudian-pick", modeId: opts.modeId, target: opts.target, text: opts.text, word });
    close();
  };
  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    } else if (e.key === "Enter" && !e.isComposing) {
      e.stopPropagation();
      e.preventDefault();
      send();
    }
  }

  root.querySelector(".mask").onclick = close;
  root.querySelector(".cancel").onclick = close;
  root.querySelector(".close").onclick = close;
  sendBtn.onclick = send;
  document.addEventListener("keydown", onKey, true);

  document.documentElement.append(host);
  // 只有一个词时直接选中
  if (words.length === 1) {
    picked.add(0);
    update();
  }
  input.focus();
};
