// config.js 由 install.bat 生成（含 token，不入库）；不存在时回退到选项页手动配置
try {
  importScripts("config.js");
} catch {}
importScripts("defaults.js");

const PARENT_ID = "send-to-claudian";
const TARGET_PREFIX = "t:"; // t:<modeId>:<target>

let sessionTitles = {}; // 会话 id → 菜单上显示的名称，供选词面板标题使用

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}

async function api(path, init = {}) {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  if (!cfg.token) throw new Error("NO_TOKEN");
  const res = await fetch(`http://127.0.0.1:${cfg.port}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
      ...(init.headers || {}),
    },
  });
  if (res.status === 401) throw new Error("token 不正确，请到选项页重新填写");
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---- 右键菜单：笔记类型 ▸ 当前会话 / 新会话 / 每个已打开的 Claudian 会话 ----

function createMenu(props) {
  return new Promise((resolve) => chrome.contextMenus.create(props, () => {
    void chrome.runtime.lastError;
    resolve();
  }));
}

async function buildMenus() {
  const { modes } = await loadConfig();
  let sessions = null;
  try {
    sessions = (await api("/sessions")).sessions;
    sessionTitles = Object.fromEntries(sessions.map((s) => [s.id, `${s.index}. ${s.title}`]));
  } catch {}

  await chrome.contextMenus.removeAll();
  await createMenu({ id: PARENT_ID, title: "发送到 Claudian 记笔记", contexts: ["selection"] });

  for (const mode of modes) {
    const modeMenu = "m:" + mode.id;
    await createMenu({ parentId: PARENT_ID, id: modeMenu, title: mode.name, contexts: ["selection"] });

    const base = { parentId: modeMenu, contexts: ["selection"] };
    const prefix = `${TARGET_PREFIX}${mode.id}:`;
    await createMenu({ ...base, id: prefix + "active", title: "当前会话" });
    await createMenu({ ...base, id: prefix + "new", title: "新建会话" });
    await createMenu({ ...base, id: "sep:" + mode.id, type: "separator" });

    if (sessions === null) {
      await createMenu({ ...base, id: "offline:" + mode.id, title: "（未连接 Obsidian，会话列表不可用）", enabled: false });
    } else {
      for (const s of sessions) {
        const mark = s.isActive ? "● " : "";
        const busy = s.isWorking ? "  [回答中]" : "";
        await createMenu({ ...base, id: prefix + s.id, title: `${mark}${s.index}. ${s.title}${busy}` });
      }
    }
  }
}

// 串行化 + 防抖，避免 removeAll/create 交错
let menuChain = Promise.resolve();
let refreshTimer = null;
function refreshMenus() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    menuChain = menuChain.then(buildMenus).catch((e) => console.error(e));
  }, 200);
}

chrome.runtime.onInstalled.addListener(refreshMenus);
chrome.runtime.onStartup.addListener(refreshMenus);
// 从 Obsidian 切回 Chrome、切换标签页时刷新会话列表
chrome.windows.onFocusChanged.addListener((winId) => {
  if (winId !== chrome.windows.WINDOW_ID_NONE) refreshMenus();
});
chrome.tabs.onActivated.addListener(refreshMenus);
chrome.storage.onChanged.addListener(refreshMenus);

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// ---- 发送 ----

async function send(mode, vars, target) {
  const prompt = renderTemplate(mode.template, vars);
  try {
    await api("/ask", { method: "POST", body: JSON.stringify({ ...vars, prompt, target }) });
  } catch (e) {
    if (e.message === "NO_TOKEN") {
      notify("Send to Claudian", "还没有配置 token，请先在扩展选项页填写。");
      chrome.runtime.openOptionsPage();
    } else {
      const msg = e instanceof TypeError ? "连接失败：Obsidian 未打开或 Claudian Bridge 未启用" : e.message;
      notify("发送到 Claudian 失败", msg);
    }
  }
  refreshMenus();
}

async function findMode(modeId) {
  const { modes } = await loadConfig();
  return modes.find((m) => m.id === modeId);
}

// 模板含 {{word}} 时，先在网页上弹出选词面板，让用户从选中的句子里再选一个词
async function showPicker(tab, info, mode, target, text) {
  const targetName =
    target === "active" ? "当前会话" : target === "new" ? "新建会话" : sessionTitles[target] || "指定会话";
  const injection = { target: { tabId: tab.id, frameIds: [info.frameId ?? 0] } };
  try {
    await chrome.scripting.executeScript({ ...injection, files: ["picker.js"] });
    await chrome.scripting.executeScript({
      ...injection,
      func: (opts) => globalThis.claudianShowPicker(opts),
      args: [{ text, modeId: mode.id, modeName: mode.name, target, targetName }],
    });
  } catch {
    notify("无法打开选词面板", "当前页面（如 chrome:// 页、PDF 查看器）不允许扩展注入，请换个页面或改用其他笔记类型。");
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = String(info.menuItemId);
  if (!menuId.startsWith(TARGET_PREFIX)) return;
  const rest = menuId.slice(TARGET_PREFIX.length);
  const sep = rest.indexOf(":");
  const modeId = rest.slice(0, sep);
  const target = rest.slice(sep + 1);

  const text = (info.selectionText || "").trim();
  if (!text) return;

  const mode = await findMode(modeId);
  if (!mode) return refreshMenus();

  if (mode.template.includes("{{word}}")) {
    if (tab?.id) return showPicker(tab, info, mode, target, text);
    return notify("无法打开选词面板", "当前页面不是普通标签页，请在网页中使用单词笔记。");
  }

  await send(mode, { text, word: text, title: tab?.title || "", url: tab?.url || info.pageUrl || "" }, target);
});

// 选词面板确认后发回来的消息
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "claudian-pick" || sender.id !== chrome.runtime.id) return;
  (async () => {
    const mode = await findMode(msg.modeId);
    if (!mode) return notify("发送到 Claudian 失败", "该笔记类型已被删除");
    const vars = { text: msg.text, word: msg.word, title: sender.tab?.title || "", url: sender.tab?.url || "" };
    await send(mode, vars, msg.target);
  })();
});
