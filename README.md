# Multica Knowledge Capture

A Chrome/Edge Manifest V3 extension for creating a traceable Multica knowledge-capture issue from the active webpage.

[中文版说明](README.zh-CN.md)

## Install locally

1. Open `chrome://extensions` (or `edge://extensions`) and enable Developer mode.
2. Choose **Load unpacked** and select this directory.
3. Open the extension, enter the Multica server URL, personal access token, and destination project UUID, then save.
4. On an `http`/`https` article page, open the extension and select **Create link-mode issue**.

## Privacy and permissions

The manifest requests only:

- `activeTab`, to read the URL and title of the page the user explicitly opens the extension on;
- `storage`, to retain the user's server URL, token, and selected project locally in the browser profile.

The server origin is an *optional* permission requested only after the user saves that specific server URL; it is required for the issue-creation request. There are no install-time host permissions, content scripts, or page-body extraction. Link mode submits only URL, title, site hostname, capture timestamp, and the optional note entered in the popup.

## Multica API contract

The extension sends `POST {serverUrl}/api/issues` with an `Authorization: Bearer {token}` header and JSON content:

```json
{
  "title": "Knowledge capture: Example article",
  "description": "Human-readable, traceable source fields",
  "project_id": "target-project-uuid",
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

The server should create an issue in `project_id`, persist `source` where custom structured fields are supported, and return an issue object (or `{ "issue": issue }`) containing at least `id` or `identifier`. The source is also included in `description` so it remains traceable if the server has not yet added structured source support.

### Authorization and project selection

M1 uses a user-provided personal access token and project UUID. A future server-backed OAuth or project-picker flow can replace these inputs without changing the capture payload. Tokens are never placed in an issue or page request and are stored only using `chrome.storage.local`.

## Scope

This M1 release implements link mode only. Selection capture, full-page snapshots, retries, and an issue link are intentionally deferred to later milestones; any body snapshot must remain opt-in.
