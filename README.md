# Send to Claudian

在 Chrome 里选中文字 → 右键「发送到 Claudian 记笔记」→ 文字套上提示词模板，自动发送到本机 Obsidian 的 Claudian 插件，由它回答并记录笔记。

```
Chrome 扩展 ──POST http://127.0.0.1:27125/ask──▶ Obsidian「Claudian Bridge」插件 ──▶ Claudian 输入框 + 自动发送
```

## 环境要求
- Windows + Chrome（或其他 Chromium 内核浏览器）
- Obsidian 桌面版，已安装并启用 [Claudian](https://github.com/YishenTu/claudian) 插件（在 v2.3.12 上测试）

## 安装

```bash
git clone https://github.com/19730056099-creator/ChromeConnectClaudian.git
```

1. **双击 `install.bat`**。它会：
   - 自动找到所有装了 Claudian 的 vault，安装并启用 Claudian Bridge；
   - 生成 token，同时写入桥接插件和 Chrome 扩展（不用手动粘贴）；
   - 打开 Chrome 扩展页，并把扩展文件夹路径复制到剪贴板。
2. **重启 Obsidian**。
3. 在 Chrome 扩展页打开「开发者模式」→「加载已解压的扩展程序」→ 粘贴路径，选中 `chrome-extension` 文件夹（Chrome 不允许脚本自动安装商店外的扩展，这一步只需做一次）。

以后更新代码，重新双击 `install.bat`（token 会沿用），再在扩展页点刷新即可。

> 多个 vault 同时打开时，只有一个能占用端口（其余会提示端口被占用，可忽略）。

## 使用
任意网页选中文字 → 右键 → **发送到 Claudian 记笔记** → 选择目标会话：

- **当前会话**：Claudian 当前激活的标签页
- **新建会话**：新开一个标签页
- **具体会话**：列出 Claudian 里所有已打开的会话（● 表示当前激活，[回答中] 表示正在生成）

会话列表会在你从 Obsidian 切回 Chrome、或切换浏览器标签页时自动刷新。Obsidian 中 Claudian 会自动切到对应会话并开始回答。

提示词模板可在扩展设置页修改，支持 `{{text}}`、`{{title}}`、`{{url}}`。

## 手动安装（非 Windows 或不想用脚本）
1. 把 `obsidian-bridge/` 下的 `manifest.json`、`main.js` 复制到 `<vault>/.obsidian/plugins/claudian-bridge/`，在 Obsidian 中启用 **Claudian Bridge**，在它的设置页复制 token。
2. Chrome 加载 `chrome-extension` 文件夹，点工具栏图标打开设置页，粘贴 token 并保存。

## 工作原理与注意事项
- 桥接插件只监听 `127.0.0.1`，所有请求都需要 `Authorization: Bearer <token>`。
- Claudian 没有公开 API，桥接插件调用的是它的内部方法（`activateView`、`getView`、`getTabManager().switchToTab`、`appendToActiveInput` 等），并模拟按下 Enter 发送。Claudian 升级后这些方法可能变化，届时需要适配。

## 命令行测试
```bash
curl -X POST http://127.0.0.1:27125/ask \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"prompt":"测试一下"}'
```
