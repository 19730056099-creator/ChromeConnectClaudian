// config.js（安装脚本生成）需在本文件之前加载
const INSTALLED = self.CLAUDIAN_CONFIG || {};

// 笔记类型：右键菜单的第一级。模板含 {{word}} 时会弹出选词面板，从选中的句子里再选一个词
const DEFAULT_MODES = [
  {
    id: "explain",
    name: "解释并记笔记",
    template:
      "请解释下面这段内容，并整理成一篇笔记保存到 vault 中（注明来源）。\n" +
      "来源：{{title}} {{url}}\n\n" +
      "> {{text}}",
  },
  {
    id: "word",
    name: "单词笔记（例句）",
    template:
      "请为下列单词/短语写单词笔记并保存到 vault 中（多个时每个单独一篇）：{{word}}\n" +
      "每篇包括：音标、词性、在下面例句中的含义、常见搭配与用法、近义词。\n" +
      "例句来源：{{title}} {{url}}\n\n" +
      "> {{text}}",
  },
  {
    id: "translate",
    name: "翻译",
    template:
      "请把下面这段内容翻译成中文，并把原文与译文整理成笔记保存到 vault 中（注明来源）。\n" +
      "来源：{{title}} {{url}}\n\n" +
      "> {{text}}",
  },
];

const DEFAULTS = {
  port: INSTALLED.port || 27125,
  token: INSTALLED.token || "",
  modes: DEFAULT_MODES,
};

// 读取配置；兼容 0.2.x 的单模板 template 字段
async function loadConfig() {
  const cfg = await chrome.storage.sync.get({ ...DEFAULTS, modes: null, template: null });
  if (!Array.isArray(cfg.modes) || !cfg.modes.length) {
    cfg.modes = DEFAULT_MODES.map((m) =>
      m.id === "explain" && cfg.template ? { ...m, template: cfg.template } : { ...m }
    );
  }
  delete cfg.template;
  return cfg;
}

function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (!(key in vars)) return m;
    // 多行内容放在引用块里时每行都加 "> "
    if (new RegExp(`^>\\s*\\{\\{${key}\\}\\}`, "m").test(template)) {
      return String(vars[key]).replace(/\n/g, "\n> ");
    }
    return vars[key];
  });
}
