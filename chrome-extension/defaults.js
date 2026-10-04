// config.js（安装脚本生成）需在本文件之前加载
const INSTALLED = self.CLAUDIAN_CONFIG || {};

const DEFAULTS = {
  port: INSTALLED.port || 27125,
  token: INSTALLED.token || "",
  template:
    "请解释下面这段内容，并整理成一篇笔记保存到 vault 中（注明来源）。\n" +
    "来源：{{title}} {{url}}\n\n" +
    "> {{text}}",
};

function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (!(key in vars)) return m;
    // 多行原文在引用块里每行都加 "> "
    if (key === "text" && /^>\s*\{\{text\}\}/m.test(template)) {
      return vars.text.replace(/\n/g, "\n> ");
    }
    return vars[key];
  });
}
