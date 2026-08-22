# Multica 知识采集

这是一个 Chrome / Edge Manifest V3 扩展，可从当前网页创建一条可追溯的 Multica 知识采集 issue。

[English README](README.en.md)

## 本地加载

1. 打开 `chrome://extensions`（或 `edge://extensions`），开启开发者模式。
2. 点击“加载已解压的扩展程序”，选择本目录。
3. 从扩展弹窗打开“设置”，填写 Multica 服务地址和个人访问令牌，再加载并选择工作区、项目和 Agent，为各域名添加目标后保存；无需手动填写 UUID。使用 `*` 可设置默认目标。
4. 在任意 `http` / `https` 文章页打开扩展，点击“创建采集 issue”。

可在“设置”的“语言”中切换 English / 中文；该选择会同时应用于设置页和采集弹窗。

## 隐私与权限

扩展清单仅声明以下安装时权限：

- `activeTab` 与 `scripting`：只在用户主动打开扩展时读取当前页面的 URL 和标题；仅当用户勾选明确确认项后，才读取可选的选中文本或页面正文快照；
- `storage`：在浏览器本地保存服务地址、令牌和按域名配置的目标。

保存服务地址时，扩展才会针对该特定服务器按需请求可选的站点访问权限，以创建 issue。扩展不申请安装时站点权限，也不包含常驻内容脚本。

默认链接模式只提交 URL、标题、站点主机名、采集时间，以及用户在弹窗内主动输入的备注；不会上传正文、选区、Cookie 或截图。选区与正文快照均为独立的可选项；正文快照只有在用户勾选“确认提取并上传”后才会读取。若提取失败或没有文本，扩展会自动降级为链接模式并明确提示。

## Multica API 契约

扩展向 `POST {serverUrl}/api/issues` 发起 JSON 请求，并携带 `Authorization: Bearer {token}` 请求头：

```json
{
  "title": "Knowledge capture: Example article",
  "description": "可供阅读和追溯的来源字段",
  "project_id": "目标项目 UUID",
  "assignee_id": "目标 Agent UUID",
  "source": {
    "url": "https://example.com/article",
    "title": "Example article",
    "site": "example.com",
    "captured_at": "2026-08-22T00:00:00.000Z",
    "capture_mode": "link",
    "selected_text": null,
    "body_snapshot": null
  }
}
```

服务端应在 `project_id` 对应项目中创建 issue；若支持结构化自定义字段，应持久化 `source`。接口返回 issue 对象（或 `{ "issue": issue }`），其中至少包含 `id` 或 `identifier`。来源信息同时写入 `description`，确保尚未支持结构化字段的服务端也能保留可追溯记录。

### 授权与项目选择

M1 使用用户提供的个人访问令牌，以及按域名配置的项目 / Agent 组合。用户授权访问配置的服务器后，设置页通过 `GET /api/workspaces`、`GET /api/projects?workspace_id=…` 和 `GET /api/agents?workspace_id=…` 加载可读名称，用户无需手动填写 UUID。设置页支持精确域名（`example.com`）、子域名通配符（`*.example.com`）和默认目标（`*`）；采集时依次匹配精确域名、最具体的通配符和默认目标。令牌不会写入 issue 或页面请求，只保存在 `chrome.storage.local` 中。

## 当前范围

提交失败时，备注及可选项会保留在弹窗中，用户修复网络或配置后可直接再次提交。成功后，如果接口返回 issue URL 或 ID，弹窗会给出跳转入口。

## 知识库归档

后续 Agent 的来源字段、去重、PARA 归类、Git 可追溯性和 issue 回写格式见 [docs/archiving-agent.md](docs/archiving-agent.md)。
