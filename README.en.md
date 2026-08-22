# Multica Knowledge Capture

A Chrome/Edge Manifest V3 extension for creating a traceable Multica knowledge-capture issue from the active webpage.

[中文版说明](README.md)

## Install locally

1. Open `chrome://extensions` (or `edge://extensions`) and enable Developer mode.
2. Choose **Load unpacked** and select this directory.
3. Open **Settings** from the extension, enter the Multica server URL and personal access token, then load and select the workspace, project, and agent for each domain destination. No UUID entry is required. Use `*` for a default destination.
4. On an `http`/`https` article page, open the extension. Its site-matched project and agent are shown by default; select another project or agent for this one capture if needed, then select **Create capture issue**.

## Privacy and permissions

The manifest requests only:

- `activeTab` and `scripting`, to read the URL/title and, only after an explicit checkbox confirmation, a page-text snapshot from the page the user explicitly opens the extension on;
- `storage`, to retain the user's server URL, token, and domain-specific destinations locally in the browser profile.

The server origin is an *optional* permission requested only after the user saves that specific server URL; it is required for the issue-creation request. There are no install-time host permissions or persistent content scripts. By default, link mode submits only URL, title, site hostname, capture timestamp, and the optional note entered in the popup. Snapshot extraction starts only after the user checks its explicit confirmation. If extraction fails or produces no text, the issue is created in link mode and the popup reports the fallback.

## Multica API contract

The extension sends `POST {serverUrl}/api/issues` with an `Authorization: Bearer {token}` header and JSON content:

```json
{
  "title": "Knowledge capture: Example article",
  "description": "Human-readable, traceable source fields",
  "project_id": "target-project-uuid",
  "assignee_type": "agent",
  "assignee_id": "target-agent-uuid"
}
```

The server creates an issue in `project_id` and assigns it to the Agent; `assignee_type` and `assignee_id` must be supplied together. It returns an issue object (or `{ "issue": issue }`) containing at least `id` or `identifier`. The source remains traceable through `description`.

### Authorization and project selection

M1 uses a user-provided personal access token and domain-specific project/agent pairs. After the user grants the configured server permission, Settings loads `GET /api/workspaces`, `GET /api/projects?workspace_id=…`, and `GET /api/agents?workspace_id=…`, so users select readable names instead of entering UUIDs. The settings page accepts exact domains (`example.com`), subdomain wildcards (`*.example.com`), and a default (`*`). Capture selects an exact domain first, then the most specific matching wildcard, then the default, and shows that destination in the popup. The popup can temporarily override the project or agent without changing the saved domain destination. Tokens are never placed in an issue or page request and are stored only using `chrome.storage.local`.

Choose English or Chinese from the Language setting. The preference applies to both Settings and the capture popup.

## Scope

The popup preserves the note and opt-in choices after an API failure, so the user can correct settings/network access and submit again. A successful response exposes an issue link when the API returns an issue URL or ID.

## Troubleshooting and reporting

When an error occurs, the popup or Settings page shows **Copy diagnostic report**. Check the displayed error first (the usual causes are server permission, network, token, or destination configuration), then attach the copied report to a Multica issue or support request. It contains only the latest 20 timestamps, extension version, browser information, event type, HTTP status, and server origin; it **never includes** an access token, note, page snapshot, or full page URL.

To reproduce a problem, enable Developer mode in `chrome://extensions` / `edge://extensions`, select **Inspect views** for the extension to open the popup console, and use the extension **Details** page to inspect errors. A deliberately invalid token, revoked server-site permission, or unreachable test server reproduces authentication, permission, and network errors respectively. Never paste a real token or page snapshot into DevTools or an issue.

## Knowledge-base archiving

The follow-up agent contract, including source fields, deduplication, PARA placement, Git traceability, and the issue reply format, is documented in [docs/archiving-agent.md](docs/archiving-agent.md).
