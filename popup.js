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

function issueDescription(source, note, snapshot) {
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
  return [fields.join("\n"), fencedSection("User note", note), fencedSection("Page-text snapshot", snapshot)].filter(Boolean).join("\n");
}

function issuePayload(source, note, projectId, agentId, snapshot) {
  return {
    title: `Knowledge capture: ${source.title || source.site}`,
    description: issueDescription(source, note, snapshot),
    project_id: projectId,
    assignee_id: agentId,
    // The structured source object is deliberately duplicated in the request.
    // Server implementations that support custom properties may persist it;
    // the Markdown description keeps the issue traceable on older servers.
    source: {
      url: source.url,
      title: source.title,
      site: source.site,
      captured_at: source.capturedAt,
      capture_mode: snapshot ? "snapshot" : "link",
      body_snapshot: snapshot || null
    }
  };
}

function destinationForHostname(settings, hostname) {
  const destinations = settings.destinations || (settings.projectId && settings.agentId
    ? [{ domain: "*", projectId: settings.projectId, agentId: settings.agentId }]
    : []);
  const normalizedHostname = hostname.toLowerCase().replace(/\.+$/, "");
  const exact = destinations.find(({ domain }) => domain === normalizedHostname);
  if (exact) return exact;
  const wildcard = destinations
    .filter(({ domain }) => domain.startsWith("*."))
    .sort((left, right) => right.domain.length - left.domain.length)
    .find(({ domain }) => normalizedHostname.endsWith(domain.slice(1)) && normalizedHostname !== domain.slice(2));
  return wildcard || destinations.find(({ domain }) => domain === "*");
}

async function readOptionalPageContent(includeSnapshot) {
  if (!includeSnapshot) return { snapshot: "", snapshotFallback: false };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const root = document.querySelector("article, main") || document.body;
      const copy = root.cloneNode(true);
      copy.querySelectorAll("script, style, noscript, nav, header, footer, aside, form").forEach((node) => node.remove());
      const snapshot = copy.innerText.replace(/\n{3,}/g, "\n\n").trim().slice(0, 100000);
      return { snapshot };
    }
  });
  if (!result.snapshot) return { snapshot: "", snapshotFallback: true };
  return { snapshot: result.snapshot, snapshotFallback: false };
}

async function readCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/.test(tab.url)) throw new Error(t("openHttpPage"));
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
  const destination = destinationForHostname(settings, page.site);
  if (!settings.serverUrl || !settings.accessToken || !destination?.projectId || !destination?.agentId) {
    throw new Error(t("configureFirst", { site: page.site }));
  }
  const serverOrigin = new URL(normalizedServerUrl(settings.serverUrl)).origin;
  const hasServerPermission = await chrome.permissions.contains({ origins: [`${serverOrigin}/*`] });
  if (!hasServerPermission) throw new Error(t("saveAuthorization"));
  const button = byId("capture-button");
  button.disabled = true;
  byId("result").replaceChildren();
  setStatus(t("preparing"));
  try {
    const includeSnapshot = byId("include-snapshot").checked;
    let content;
    try {
      content = await readOptionalPageContent(includeSnapshot);
    } catch (error) {
      if (!includeSnapshot) throw error;
      content = { snapshot: "", snapshotFallback: true };
    }
    setStatus(t("creating"));
    const response = await fetch(`${normalizedServerUrl(settings.serverUrl)}/api/issues`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(issuePayload(page, byId("note").value, destination.projectId, destination.agentId, content.snapshot))
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || result.error || `Multica returned ${response.status}.`);
    const issue = result.issue || result;
    const reference = issue.identifier || issue.id || "issue";
    setStatus(t("created", { reference, fallback: content.snapshotFallback ? t("snapshotFallback") : "." }), "success");
    const issueUrl = issue.url || (issue.id ? `${normalizedServerUrl(settings.serverUrl)}/issues/${issue.id}` : "");
    if (issueUrl) {
      const link = document.createElement("a");
      link.href = issueUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = t("openCreatedIssue");
      byId("result").append(link);
    }
  } finally {
    button.disabled = false;
  }
}

byId("settings-button").addEventListener("click", () => chrome.runtime.openOptionsPage());
byId("capture-button").addEventListener("click", () => createIssue().catch((error) => setStatus(error.message, "error")));

async function initializePopup() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  applyLanguage(stored[SETTINGS_KEY]?.language || "en");
  await readCurrentPage();
}

initializePopup().catch((error) => setStatus(error.message, "error"));
