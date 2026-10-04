const $ = (id) => document.getElementById(id);

function setStatus(msg, ok) {
  $("status").textContent = msg;
  $("status").style.color = ok ? "green" : "crimson";
}

function readForm() {
  return {
    port: parseInt($("port").value, 10) || DEFAULTS.port,
    token: $("token").value.trim(),
    template: $("template").value || DEFAULTS.template,
  };
}

async function load() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  $("port").value = cfg.port;
  $("token").value = cfg.token;
  $("template").value = cfg.template;
}

$("save").onclick = async () => {
  await chrome.storage.sync.set(readForm());
  setStatus("已保存", true);
};

$("reset").onclick = () => {
  $("template").value = DEFAULTS.template;
  setStatus("已恢复默认模板（记得保存）", true);
};

$("test").onclick = async () => {
  const { port, token } = readForm();
  setStatus("测试中…", true);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) return setStatus("Token 不正确", false);
    const data = await res.json();
    if (!data.claudian) return setStatus("已连接 Obsidian，但未检测到启用的 Claudian 插件", false);
    setStatus("连接成功 ✓", true);
  } catch {
    setStatus("连接失败：Obsidian 未打开或 Claudian Bridge 未启用", false);
  }
};

load();
