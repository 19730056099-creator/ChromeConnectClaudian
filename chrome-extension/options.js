const $ = (id) => document.getElementById(id);

function setPill(el, msg, kind) {
  el.textContent = msg;
  el.className = "pill" + (kind ? " " + kind : "");
}

let statusTimer = null;
function setStatus(msg, ok) {
  setPill($("status"), msg, ok ? "ok" : "warn");
  clearTimeout(statusTimer);
  if (ok) statusTimer = setTimeout(() => setPill($("status"), ""), 2500);
}

function markDirty(dirty = true) {
  $("dirty").hidden = !dirty;
}

// ---- 笔记类型列表 ----

let lastTemplate = null; // 最近聚焦的模板框，点击占位符时插入到这里

function refreshModes() {
  const rows = [...$("modes").children].filter((el) => el.classList.contains("mode"));
  rows.forEach((row, i) => {
    row.querySelector(".mode-index").textContent = i + 1;
    row.querySelector(".tag").hidden = !row.querySelector(".template").value.includes("{{word}}");
  });
  $("mode-count").textContent = `${rows.length} 个 · 对应右键菜单的第一级`;
  if (!rows.length) $("modes").innerHTML = '<div class="empty">还没有笔记类型，点击右上角添加</div>';
  else $("modes").querySelector(".empty")?.remove();
}

function addModeRow(mode) {
  $("modes").querySelector(".empty")?.remove();
  const row = $("mode-tpl").content.firstElementChild.cloneNode(true);
  row.dataset.id = mode.id;
  row.querySelector(".name").value = mode.name;
  const ta = row.querySelector(".template");
  ta.value = mode.template;
  ta.addEventListener("focus", () => (lastTemplate = ta));
  row.addEventListener("input", () => {
    markDirty();
    refreshModes();
  });
  const moved = () => {
    markDirty();
    refreshModes();
  };
  row.querySelector(".up").onclick = () => {
    row.previousElementSibling?.before(row);
    moved();
  };
  row.querySelector(".down").onclick = () => {
    row.nextElementSibling?.after(row);
    moved();
  };
  row.querySelector(".del").onclick = () => {
    if (lastTemplate === ta) lastTemplate = null;
    row.remove();
    moved();
  };
  $("modes").append(row);
  return row;
}

function renderModes(modes) {
  $("modes").replaceChildren();
  lastTemplate = null;
  modes.forEach(addModeRow);
  refreshModes();
}

function readModes() {
  return [...$("modes").querySelectorAll(".mode")].map((row) => ({
    id: row.dataset.id,
    name: row.querySelector(".name").value.trim(),
    template: row.querySelector(".template").value,
  }));
}

function readForm() {
  return {
    port: parseInt($("port").value, 10) || DEFAULTS.port,
    token: $("token").value.trim(),
    modes: readModes(),
  };
}

async function load() {
  $("version").textContent = "v" + chrome.runtime.getManifest().version;
  const cfg = await loadConfig();
  $("port").value = cfg.port;
  $("token").value = cfg.token;
  renderModes(cfg.modes);
  markDirty(false);
}

// 点击占位符：插入到最近编辑的模板光标处
document.querySelectorAll(".chip").forEach((chip) => {
  chip.onmousedown = (e) => e.preventDefault(); // 不抢走模板框焦点
  chip.onclick = () => {
    const ta = lastTemplate;
    if (!ta || !ta.isConnected) return setStatus("先点一下要插入的模板", false);
    ta.setRangeText(chip.dataset.ph, ta.selectionStart, ta.selectionEnd, "end");
    ta.focus();
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  };
});

$("port").addEventListener("input", () => markDirty());
$("token").addEventListener("input", () => markDirty());

$("add").onclick = () => {
  const row = addModeRow({ id: Date.now().toString(36), name: "", template: "{{text}}" });
  refreshModes();
  markDirty();
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.querySelector(".name").focus();
};

$("reset").onclick = () => {
  renderModes(DEFAULT_MODES);
  markDirty();
  setStatus("已恢复默认类型，记得保存", true);
};

$("save").onclick = async () => {
  const form = readForm();
  if (!form.modes.length) return setStatus("至少保留一个笔记类型", false);
  if (form.modes.some((m) => !m.name)) return setStatus("类型名称不能为空", false);
  if (form.modes.some((m) => !m.template.trim())) return setStatus("模板不能为空", false);
  await chrome.storage.sync.set(form);
  await chrome.storage.sync.remove("template");
  markDirty(false);
  setStatus("已保存", true);
};

$("test").onclick = async () => {
  const { port, token } = readForm();
  setPill($("conn"), "测试中…");
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) return setPill($("conn"), "Token 不正确", "warn");
    const data = await res.json();
    if (!data.claudian) return setPill($("conn"), "已连接 Obsidian，但未检测到 Claudian", "warn");
    setPill($("conn"), "连接成功", "ok");
  } catch {
    setPill($("conn"), "连接失败：Obsidian 未打开或 Bridge 未启用", "warn");
  }
};

load();
