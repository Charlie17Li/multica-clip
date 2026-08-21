const SETTINGS_KEY = "multicaCaptureSettings";
let page = null;

const byId = (id) => document.getElementById(id);

function normalizedServerUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function setStatus(message, kind = "") {
  const element = byId("status");
  element.textContent = message;
  element.className = kind;
}

function escapeMarkdown(value) {
  return String(value).replace(/([\\`*_{}\[\]<>])/g, "\\$1");
}

function issueDescription(source, note) {
  const fields = [
    "## Knowledge capture source",
    "",
    `- **URL:** ${source.url}`,
    `- **Title:** ${escapeMarkdown(source.title)}`,
    `- **Site:** ${escapeMarkdown(source.site)}`,
    `- **Captured at:** ${source.capturedAt}`,
    "- **Capture mode:** link",
    "- **Body snapshot:** not collected"
  ];
  if (note.trim()) fields.push("", "## User note", "", note.trim());
  return fields.join("\n");
}

function issuePayload(source, note, projectId) {
  return {
    title: `Knowledge capture: ${source.title || source.site}`,
    description: issueDescription(source, note),
    project_id: projectId,
    // The structured source object is deliberately duplicated in the request.
    // Server implementations that support custom properties may persist it;
    // the Markdown description keeps the issue traceable on older servers.
    source: {
      url: source.url,
      title: source.title,
      site: source.site,
      captured_at: source.capturedAt,
      capture_mode: "link",
      body_snapshot: null
    }
  };
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] || {};
  byId("server-url").value = settings.serverUrl || "";
  byId("access-token").value = settings.accessToken || "";
  byId("project-id").value = settings.projectId || "";
}

async function saveSettings() {
  const settings = {
    serverUrl: normalizedServerUrl(byId("server-url").value),
    accessToken: byId("access-token").value.trim(),
    projectId: byId("project-id").value.trim()
  };
  if (settings.serverUrl) {
    const origin = new URL(settings.serverUrl).origin;
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) throw new Error("Server access permission is required to create issues.");
  }
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  setStatus("Authorization settings saved.", "success");
}

async function readCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/.test(tab.url)) throw new Error("Open an http(s) page to capture it.");
  const url = new URL(tab.url);
  page = {
    url: tab.url,
    title: tab.title || url.hostname,
    site: url.hostname,
    capturedAt: new Date().toISOString()
  };
  byId("page-title").textContent = page.title;
  byId("page-url").textContent = page.url;
  byId("page-site").textContent = page.site;
}

async function createIssue() {
  if (!page) return;
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] || {};
  if (!settings.serverUrl || !settings.accessToken || !settings.projectId) {
    byId("settings").hidden = false;
    byId("settings-button").setAttribute("aria-expanded", "true");
    throw new Error("Configure the Multica server, token, and target project first.");
  }
  const serverOrigin = new URL(normalizedServerUrl(settings.serverUrl)).origin;
  const hasServerPermission = await chrome.permissions.contains({ origins: [`${serverOrigin}/*`] });
  if (!hasServerPermission) throw new Error("Save authorization settings to grant access to this Multica server.");
  const button = byId("capture-button");
  button.disabled = true;
  setStatus("Creating issue…");
  try {
    const response = await fetch(`${normalizedServerUrl(settings.serverUrl)}/api/issues`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(issuePayload(page, byId("note").value, settings.projectId))
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || result.error || `Multica returned ${response.status}.`);
    const issue = result.issue || result;
    const reference = issue.identifier || issue.id || "issue";
    setStatus(`Created ${reference}.`, "success");
  } finally {
    button.disabled = false;
  }
}

byId("settings-button").addEventListener("click", () => {
  const panel = byId("settings");
  panel.hidden = !panel.hidden;
  byId("settings-button").setAttribute("aria-expanded", String(!panel.hidden));
});
byId("save-settings").addEventListener("click", () => saveSettings().catch((error) => setStatus(error.message, "error")));
byId("capture-button").addEventListener("click", () => createIssue().catch((error) => setStatus(error.message, "error")));

Promise.all([loadSettings(), readCurrentPage()]).catch((error) => setStatus(error.message, "error"));
