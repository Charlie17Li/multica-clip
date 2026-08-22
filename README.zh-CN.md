# Multica 知识采集

这是一个 Chrome / Edge Manifest V3 扩展，可从当前网页创建一条可追溯的 Multica 知识采集 issue。

[English README](README.md)

## 本地加载

1. 打开 `chrome://extensions`（或 `edge://extensions`），开启开发者模式。
2. 点击“加载已解压的扩展程序”，选择本目录。
3. 打开扩展，填写 Multica 服务地址、个人访问令牌和目标项目 UUID，然后保存。
4. 在任意 `http` / `https` 文章页打开扩展，点击“创建链接模式 issue”。

## 隐私与权限

扩展清单仅声明以下安装时权限：

- `activeTab`：只在用户主动打开扩展时读取当前页面的 URL 和标题；
- `storage`：在浏览器本地保存服务地址、令牌和目标项目。

保存服务地址时，扩展才会针对该特定服务器按需请求可选的站点访问权限，以创建 issue。扩展不申请安装时站点权限，不包含内容脚本，也不会提取页面正文。

链接模式只提交 URL、标题、站点主机名、采集时间，以及用户在弹窗内主动输入的备注；不会上传正文、选区、Cookie 或截图。

## Multica API 契约

扩展向 `POST {serverUrl}/api/issues` 发起 JSON 请求，并携带 `Authorization: Bearer {token}` 请求头：

```json
{
  "title": "Knowledge capture: Example article",
  "description": "可供阅读和追溯的来源字段",
  "project_id": "目标项目 UUID",
  "source": {
    "url": "https://example.com/article",
    "title": "Example article",
    "site": "example.com",
    "captured_at": "2026-08-22T00:00:00.000Z",
    "capture_mode": "link",
    "body_snapshot": null
  }
}
```

服务端应在 `project_id` 对应项目中创建 issue；若支持结构化自定义字段，应持久化 `source`。接口返回 issue 对象（或 `{ "issue": issue }`），其中至少包含 `id` 或 `identifier`。来源信息同时写入 `description`，确保尚未支持结构化字段的服务端也能保留可追溯记录。

### 授权与项目选择

M1 使用用户提供的个人访问令牌和项目 UUID。后续可替换为服务端 OAuth 或项目选择器，而不改变采集请求的结构。令牌不会写入 issue 或页面请求，只保存在 `chrome.storage.local` 中。

## 当前范围

本 M1 版本仅实现链接模式。选区采集、全文快照、失败重试和 issue 跳转入口均留待后续里程碑实现；任何正文快照都必须由用户明确选择。
