"use strict";

const { Plugin, PluginSettingTab, Setting, Notice } = require("obsidian");
const http = require("http");
const crypto = require("crypto");

const CLAUDIAN_ID = "realclaudian";
const MAX_BODY = 1024 * 1024;

const DEFAULT_SETTINGS = {
  port: 27125,
  token: "",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(obj));
}

class ClaudianBridgePlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.token) {
      this.settings.token = crypto.randomBytes(16).toString("hex");
      await this.saveData(this.settings);
    }
    this.addSettingTab(new BridgeSettingTab(this.app, this));
    this.startServer();
  }

  onunload() {
    this.stopServer();
  }

  startServer() {
    this.stopServer();
    const server = http.createServer((req, res) => this.handle(req, res));
    server.on("error", (err) => {
      console.error("[claudian-bridge]", err);
      new Notice(`Claudian Bridge 启动失败：${err.code === "EADDRINUSE" ? `端口 ${this.settings.port} 已被占用` : err.message}`);
    });
    server.listen(this.settings.port, "127.0.0.1", () => {
      console.log(`[claudian-bridge] listening on 127.0.0.1:${this.settings.port}`);
    });
    this.server = server;
  }

  stopServer() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  isAuthorized(req) {
    const auth = req.headers["authorization"] || "";
    const expected = `Bearer ${this.settings.token}`;
    const a = Buffer.from(auth);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  handle(req, res) {
    if (req.method === "OPTIONS") return sendJson(res, 200, {});
    if (!this.isAuthorized(req)) return sendJson(res, 401, { ok: false, error: "unauthorized" });

    const path = (req.url || "").split("?")[0];
    if (req.method === "GET" && path === "/ping") {
      return sendJson(res, 200, { ok: true, claudian: !!this.getClaudian() });
    }
    if (req.method === "GET" && path === "/sessions") {
      return sendJson(res, 200, { ok: true, sessions: this.listSessions() });
    }
    if (req.method === "POST" && path === "/ask") {
      let size = 0;
      const chunks = [];
      req.on("data", (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          sendJson(res, 413, { ok: false, error: "payload too large" });
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", async () => {
        if (res.writableEnded) return;
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          return sendJson(res, 400, { ok: false, error: "invalid json" });
        }
        const prompt = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt : body.text;
        if (typeof prompt !== "string" || !prompt.trim()) {
          return sendJson(res, 400, { ok: false, error: "empty prompt" });
        }
        try {
          await this.sendToClaudian(prompt, body.target);
          sendJson(res, 200, { ok: true });
        } catch (e) {
          console.error("[claudian-bridge]", e);
          new Notice(`发送到 Claudian 失败：${e.message}`);
          sendJson(res, e.status || 500, { ok: false, error: e.message });
        }
      });
      return;
    }
    sendJson(res, 404, { ok: false, error: "not found" });
  }

  getClaudian() {
    return this.app.plugins?.plugins?.[CLAUDIAN_ID] || null;
  }

  // Claudian 聊天视图中已打开的会话（标签页）
  listSessions() {
    const tm = this.getClaudian()?.getView?.()?.getTabManager?.();
    if (!tm?.getTabBarItems) return [];
    return tm.getTabBarItems().map((t) => ({
      id: t.id,
      index: t.index,
      title: t.title || `会话 ${t.index}`,
      isActive: !!t.isActive,
      isWorking: !!t.isWorking,
    }));
  }

  // target: "active"（默认）| "new" | 会话 id
  async sendToClaudian(prompt, target) {
    const claudian = this.getClaudian();
    if (!claudian) {
      const err = new Error("未找到已启用的 Claudian 插件");
      err.status = 503;
      throw err;
    }

    await claudian.activateView();

    // 视图刚打开时标签页可能还没初始化，轮询等待
    let view = null;
    let tab = null;
    for (let i = 0; i < 30; i++) {
      view = claudian.getView();
      tab = view?.getActiveTab?.();
      if (tab?.dom?.inputEl) break;
      await sleep(100);
    }
    if (!tab?.dom?.inputEl) throw new Error("Claudian 聊天视图未就绪");

    if (target === "new") {
      tab = await view.createNewTab();
      if (!tab) throw new Error("无法新建会话（可能已达到标签页上限）");
      if (view.getActiveTab()?.id !== tab.id) await view.getTabManager().switchToTab(tab.id);
    } else if (target && target !== "active") {
      const tm = view.getTabManager();
      if (!tm.getTab(target)) {
        const err = new Error("指定的会话已关闭，请重新选择");
        err.status = 404;
        throw err;
      }
      await tm.switchToTab(target);
      tab = view.getActiveTab();
      if (tab?.id !== target) throw new Error("切换会话失败");
    }

    const inputEl = tab.dom.inputEl;
    inputEl.value = "";
    if (!view.appendToActiveInput(prompt)) throw new Error("无法写入 Claudian 输入框");

    const win = inputEl.ownerDocument.defaultView || window;
    const KeyEvt = win.KeyboardEvent || KeyboardEvent;
    inputEl.dispatchEvent(
      new KeyEvt("keydown", {
        key: "Enter",
        code: "Enter",
        ctrlKey: !!claudian.settings?.requireCommandOrControlEnterToSend,
        bubbles: true,
        cancelable: true,
      })
    );

    try {
      win.focus();
    } catch {}
    new Notice("已发送到 Claudian");
  }
}

class BridgeSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("端口")
      .setDesc("本地 HTTP 服务端口（仅监听 127.0.0.1）。修改后自动重启服务。")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.port)).onChange(async (v) => {
          const port = parseInt(v, 10);
          if (!(port > 0 && port < 65536)) return;
          this.plugin.settings.port = port;
          await this.plugin.saveData(this.plugin.settings);
          this.plugin.startServer();
        })
      );

    new Setting(containerEl)
      .setName("Token")
      .setDesc("把它粘贴到 Chrome 扩展的选项页中。")
      .addText((t) => {
        t.setValue(this.plugin.settings.token).setDisabled(true);
        t.inputEl.style.width = "22em";
      })
      .addButton((b) =>
        b.setButtonText("复制").onClick(async () => {
          await navigator.clipboard.writeText(this.plugin.settings.token);
          new Notice("Token 已复制");
        })
      )
      .addButton((b) =>
        b.setButtonText("重新生成").setWarning().onClick(async () => {
          this.plugin.settings.token = crypto.randomBytes(16).toString("hex");
          await this.plugin.saveData(this.plugin.settings);
          this.display();
        })
      );
  }
}

module.exports = ClaudianBridgePlugin;
