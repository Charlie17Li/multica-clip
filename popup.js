const SETTINGS_KEY = "multicaCaptureSettings";
let page = null;
let settings = {};

const byId = (id) => document.getElementById(id);

function normalizedServerUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function setStatus(message, kind = "") {
  const element = byId("status");
  element.textContent = message;
  element.className = kind;
}

function showDiagnostics() {
  byId("copy-diagnostics").hidden = false;
  byId("diagnostics-help").hidden = false;
}

async function reportError(event, error) {
  const message = safeDiagnosticText(error?.message);
  await recordDiagnostic(event, { message, pageHost: page?.site || "" });
  setStatus(message, "error");
  showDiagnostics();
}

function optionLabel(record) {
  return record.title || record.name || record.slug || record.id;
}

function setOptions(select, records, selectedId, placeholder) {
  select.replaceChildren(new Option(placeholder, ""));
  records.forEach((record) => select.add(new Option(optionLabel(record), record.id)));
  if (selectedId && !records.some((record) => record.id === selectedId)) {
    select.add(new Option(selectedId, selectedId));
  }
  select.value = selectedId || "";
  select.disabled = select.options.length <= 1;
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
    // Multica validates assignees as a type/id pair. Destinations in this
    // extension are agents, so sending only assignee_id is rejected with 400.
    assignee_type: "agent",
    assignee_id: agentId
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

async function loadDestinationPicker() {
  const defaultDestination = destinationForHostname(settings, page.site);
  if (!defaultDestination?.projectId || !defaultDestination?.agentId) {
    throw new Error(t("configureFirst", { site: page.site }));
  }
  const projectSelect = byId("project-id");
  const agentSelect = byId("agent-id");
  setOptions(projectSelect, [], defaultDestination.projectId, t("selectProject"));
  setOptions(agentSelect, [], defaultDestination.agentId, t("selectAgent"));

  if (!settings.serverUrl || !settings.accessToken || !settings.workspaceId) return;
  const serverUrl = normalizedServerUrl(settings.serverUrl);
  const query = `?workspace_id=${encodeURIComponent(settings.workspaceId)}`;
  try {
    const [projectsResponse, agentsResponse] = await Promise.all([
      fetch(`${serverUrl}/api/projects${query}`, { headers: { Authorization: `Bearer ${settings.accessToken}` } }),
      fetch(`${serverUrl}/api/agents${query}`, { headers: { Authorization: `Bearer ${settings.accessToken}` } })
    ]);
    const [projectsPayload, agentsPayload] = await Promise.all([
      projectsResponse.json().catch(() => ({})),
      agentsResponse.json().catch(() => ({}))
    ]);
    if (!projectsResponse.ok || !agentsResponse.ok) throw new Error("catalog unavailable");
    const projects = projectsPayload.projects || [];
    const agents = Array.isArray(agentsPayload) ? agentsPayload : agentsPayload.agents || [];
    setOptions(projectSelect, projects, defaultDestination.projectId, t("selectProject"));
    setOptions(agentSelect, agents, defaultDestination.agentId, t("selectAgent"));
  } catch (_) {
    // Keep the configured destination usable when the optional picker catalog cannot load.
  }
}

async function createIssue() {
  if (!page) return;
  const projectId = byId("project-id").value;
  const agentId = byId("agent-id").value;
  if (!settings.serverUrl || !settings.accessToken || !projectId || !agentId) {
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
      body: JSON.stringify(issuePayload(page, byId("note").value, projectId, agentId, content.snapshot))
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = `Multica returned ${response.status}.`;
      await recordDiagnostic("issue_create_failed", { status: response.status, serverOrigin, message });
      throw new Error(message);
    }
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
    await recordDiagnostic("issue_created", { serverOrigin });
  } finally {
    button.disabled = false;
  }
}

byId("settings-button").addEventListener("click", () => chrome.runtime.openOptionsPage());
byId("copy-diagnostics").addEventListener("click", () => copyDiagnosticReport().then(() => setStatus(t("diagnosticsCopied"), "success")).catch((error) => reportError("diagnostics_copy_failed", error)));
byId("capture-button").addEventListener("click", () => createIssue().catch((error) => reportError("capture_failed", error)));

async function initializePopup() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  settings = stored[SETTINGS_KEY] || {};
  applyLanguage(settings.language || "en");
  await readCurrentPage();
  await loadDestinationPicker();
}

initializePopup().catch((error) => reportError("popup_initialize_failed", error));
