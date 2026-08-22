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

function fencedSection(heading, value) {
  return value ? ["", `## ${heading}`, "", value.trim()].join("\n") : "";
}

function issueDescription(source, note, selection, snapshot) {
  const fields = [
    "## Knowledge capture source",
    "",
    `- **URL:** ${source.url}`,
    `- **Title:** ${escapeMarkdown(source.title)}`,
    `- **Site:** ${escapeMarkdown(source.site)}`,
    `- **Captured at:** ${source.capturedAt}`,
    `- **Capture mode:** ${snapshot ? "snapshot" : "link"}`,
    `- **Body snapshot:** ${snapshot ? "collected with explicit user confirmation" : "not collected"}`
  ];
  return [fields.join("\n"), fencedSection("User note", note), fencedSection("Selected text", selection), fencedSection("Page-text snapshot", snapshot)].filter(Boolean).join("\n");
}

function issuePayload(source, note, projectId, selection, snapshot) {
  return {
    title: `Knowledge capture: ${source.title || source.site}`,
    description: issueDescription(source, note, selection, snapshot),
    project_id: projectId,
    // The structured source object is deliberately duplicated in the request.
    // Server implementations that support custom properties may persist it;
    // the Markdown description keeps the issue traceable on older servers.
    source: {
      url: source.url,
      title: source.title,
      site: source.site,
      captured_at: source.capturedAt,
      capture_mode: snapshot ? "snapshot" : "link",
      selected_text: selection || null,
      body_snapshot: snapshot || null
    }
  };
}

async function readOptionalPageContent(includeSelection, includeSnapshot) {
  if (!includeSelection && !includeSnapshot) return { selection: "", snapshot: "", snapshotFallback: false };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (wantSelection, wantSnapshot) => {
      const selection = wantSelection ? window.getSelection()?.toString().trim() || "" : "";
      if (!wantSnapshot) return { selection, snapshot: "" };
      const root = document.querySelector("article, main") || document.body;
      const copy = root.cloneNode(true);
      copy.querySelectorAll("script, style, noscript, nav, header, footer, aside, form").forEach((node) => node.remove());
      const snapshot = copy.innerText.replace(/\n{3,}/g, "\n\n").trim().slice(0, 100000);
      return { selection, snapshot };
    },
    args: [includeSelection, includeSnapshot]
  });
  if (includeSnapshot && !result.snapshot) return { selection: result.selection, snapshot: "", snapshotFallback: true };
  return { selection: result.selection, snapshot: result.snapshot, snapshotFallback: false };
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
  byId("result").replaceChildren();
  setStatus("Preparing capture…");
  try {
    const includeSelection = byId("include-selection").checked;
    const includeSnapshot = byId("include-snapshot").checked;
    let content;
    try {
      content = await readOptionalPageContent(includeSelection, includeSnapshot);
    } catch (error) {
      if (!includeSnapshot) throw error;
      content = { selection: "", snapshot: "", snapshotFallback: true };
    }
    setStatus("Creating issue…");
    const response = await fetch(`${normalizedServerUrl(settings.serverUrl)}/api/issues`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(issuePayload(page, byId("note").value, settings.projectId, content.selection, content.snapshot))
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || result.error || `Multica returned ${response.status}.`);
    const issue = result.issue || result;
    const reference = issue.identifier || issue.id || "issue";
    setStatus(`Created ${reference}${content.snapshotFallback ? " in link mode because the snapshot could not be extracted." : "."}`, "success");
    const issueUrl = issue.url || (issue.id ? `${normalizedServerUrl(settings.serverUrl)}/issues/${issue.id}` : "");
    if (issueUrl) {
      const link = document.createElement("a");
      link.href = issueUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Open created issue";
      byId("result").append(link);
    }
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
