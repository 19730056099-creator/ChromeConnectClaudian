// config.js 由 install.bat 生成（含 token，不入库）；不存在时回退到选项页手动配置
try {
  importScripts("config.js");
} catch {}
importScripts("defaults.js");

const PARENT_ID = "send-to-claudian";
const TARGET_PREFIX = "target:";

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

// ---- 右键菜单：当前会话 / 新会话 / 每个已打开的 Claudian 会话 ----

function createMenu(props) {
  return new Promise((resolve) => chrome.contextMenus.create(props, () => {
    void chrome.runtime.lastError;
    resolve();
  }));
}

async function buildMenus() {
  let sessions = null;
  try {
    sessions = (await api("/sessions")).sessions;
  } catch {}

  await chrome.contextMenus.removeAll();
  const base = { parentId: PARENT_ID, contexts: ["selection"] };
  await createMenu({ id: PARENT_ID, title: "发送到 Claudian 记笔记", contexts: ["selection"] });
  await createMenu({ ...base, id: TARGET_PREFIX + "active", title: "当前会话" });
  await createMenu({ ...base, id: TARGET_PREFIX + "new", title: "新建会话" });
  await createMenu({ ...base, id: "sep", type: "separator" });

  if (sessions === null) {
    await createMenu({ ...base, id: "offline", title: "（未连接 Obsidian，会话列表不可用）", enabled: false });
  } else {
    for (const s of sessions) {
      const mark = s.isActive ? "● " : "";
      const busy = s.isWorking ? "  [回答中]" : "";
      await createMenu({ ...base, id: TARGET_PREFIX + s.id, title: `${mark}${s.index}. ${s.title}${busy}` });
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = String(info.menuItemId);
  if (!menuId.startsWith(TARGET_PREFIX)) return;
  const target = menuId.slice(TARGET_PREFIX.length);

  const text = (info.selectionText || "").trim();
  if (!text) return;

  const cfg = await chrome.storage.sync.get(DEFAULTS);
  const vars = { text, title: tab?.title || "", url: tab?.url || info.pageUrl || "" };
  const prompt = renderTemplate(cfg.template, vars);

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
});
