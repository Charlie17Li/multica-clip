const SETTINGS_KEY = "multicaCaptureSettings";
const REGION_RESULT_KEY = "multicaPendingRegionDescriptor";
const PANEL_DRAFT_KEY = "multicaSidePanelDraft";
const isSidePanel = document.body.dataset.captureSurface === "side-panel";
let page = null;
let settings = {};
let invalidRegionSelectors = new Set();

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

function extractionMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  const labels = { author: "Author", node: "Node", tags: "Tags", publishedAt: "Published at", replyCount: "Replies available" };
  return Object.entries(labels).flatMap(([key, label]) => {
    const value = Array.isArray(metadata[key]) ? metadata[key].join(", ") : metadata[key];
    return value === "" || value === undefined || value === null ? [] : [`- **${label}:** ${escapeMarkdown(value)}`];
  }).join("\n");
}

function issueDescription(source, note, extraction) {
  const snapshot = extraction.snapshot;
  const fields = [
    "## Knowledge capture source",
    "",
    `- **URL:** ${source.url}`,
    extraction.canonicalUrl ? `- **Canonical URL:** ${escapeMarkdown(extraction.canonicalUrl)}` : "",
    `- **Title:** ${escapeMarkdown(source.title)}`,
    `- **Site:** ${escapeMarkdown(source.site)}`,
    `- **Captured at:** ${source.capturedAt}`,
    `- **Capture mode:** ${snapshot ? "snapshot" : "link"}`,
    `- **Body snapshot:** ${snapshot ? "collected with explicit user confirmation" : "not collected"}`,
    `- **Adapter:** ${escapeMarkdown(extraction.adapterId || "not-run")} v${escapeMarkdown(extraction.adapterVersion || "n/a")}`
  ];
  return [fields.filter(Boolean).join("\n"), fencedSection("Extracted page fields", extractionMetadata(extraction.metadata)), fencedSection("Extraction warnings", (extraction.warnings || []).map((warning) => `- ${escapeMarkdown(warning)}`).join("\n")), fencedSection("User note", note), fencedSection("Page-text snapshot", snapshot)].filter(Boolean).join("\n");
}

function issuePayload(source, note, projectId, agentId, extraction) {
  return {
    title: `Knowledge capture: ${source.title || source.site}`,
    description: issueDescription(source, note, extraction),
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

function sameDocumentUrl(left, right) {
  try {
    const a = new URL(left); const b = new URL(right);
    a.hash = ""; b.hash = "";
    return a.href === b.href;
  } catch (_) { return false; }
}

async function pendingRegionDescriptors(tabUrl) {
  const stored = await chrome.storage.session.get(REGION_RESULT_KEY);
  const descriptors = Array.isArray(stored[REGION_RESULT_KEY]) ? stored[REGION_RESULT_KEY] : [];
  const valid = descriptors.filter((descriptor) => descriptor && typeof descriptor.selector === "string" && sameDocumentUrl(descriptor.url, tabUrl));
  if (valid.length !== descriptors.length) await chrome.storage.session.set({ [REGION_RESULT_KEY]: valid });
  return valid;
}

async function refreshRegionState() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const descriptors = tab?.url ? await pendingRegionDescriptors(tab.url) : [];
  const list = byId("region-list");
  list.replaceChildren(...descriptors.map((descriptor, index) => {
    const item = document.createElement("li");
    item.className = invalidRegionSelectors.has(descriptor.selector) ? "invalid" : "";
    const locator = document.createElement("code");
    locator.textContent = descriptor.selector;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = t("removeRegion");
    remove.addEventListener("click", async () => {
      const updated = (await pendingRegionDescriptors(tab.url)).filter((_, itemIndex) => itemIndex !== index);
      await chrome.storage.session.set({ [REGION_RESULT_KEY]: updated });
      invalidRegionSelectors.delete(descriptor.selector);
      await refreshRegionState();
    });
    item.append(locator, remove);
    return item;
  }));
  list.hidden = !descriptors.length;
  byId("region-state").hidden = !descriptors.length;
  byId("region-state").textContent = descriptors.length ? t("regionSelected", { count: descriptors.length }) : "";
  byId("clear-region").hidden = !descriptors.length;
}

async function startRegionPicker() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || "")) throw new Error(t("openHttpPage"));
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["region-picker.js"] });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.MulticaRegionPicker.start() });
}

async function openSidePanelForRegion() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || "")) throw new Error(t("openHttpPage"));
  await chrome.storage.session.set({ [PANEL_DRAFT_KEY]: {
    url: tab.url, note: byId("note").value, projectId: byId("project-id").value,
    agentId: byId("agent-id").value, includeSnapshot: byId("include-snapshot").checked
  } });
  const response = await chrome.runtime.sendMessage({ type: "open-capture-side-panel", tabId: tab.id });
  if (!response?.ok) throw new Error("side_panel_unavailable");
}

async function readOptionalPageContent(includeSnapshot) {
  if (!includeSnapshot) return { snapshot: "", snapshotFallback: false, adapterId: "not-run", adapterVersion: "n/a", warnings: [] };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["site-adapters.js"] });
  const descriptors = await pendingRegionDescriptors(tab.url);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (url, selectors) => {
      const roots = selectors.map((selector) => ({ selector, root: document.querySelector(selector) }));
      const invalidSelectors = roots.filter(({ root }) => !root || !root.isConnected).map(({ selector }) => selector);
      if (invalidSelectors.length) return { invalidSelectors };
      const selectedRoots = [];
      for (const { root } of roots) {
        if (selectedRoots.some((selected) => selected === root || selected.contains(root))) continue;
        for (let index = selectedRoots.length - 1; index >= 0; index -= 1) {
          if (root.contains(selectedRoots[index])) selectedRoots.splice(index, 1);
        }
        selectedRoots.push(root);
      }
      const results = selectedRoots.map((root) => globalThis.MulticaSiteAdapters.extract(url, document, root));
      const first = results[0] || globalThis.MulticaSiteAdapters.extract(url, document, null);
      return {
        ...first,
        snapshot: results.map((entry) => entry.snapshot).filter(Boolean).join("\n\n"),
        warnings: results.flatMap((entry) => entry.warnings || [])
      };
    },
    args: [tab.url, descriptors.map((descriptor) => descriptor.selector)]
  });
  if (result?.invalidSelectors?.length) return { ...result, snapshot: "", snapshotFallback: false };
  if (descriptors.length) await chrome.storage.session.remove(REGION_RESULT_KEY);
  if (!result?.snapshot) return { ...(result || {}), snapshot: "", snapshotFallback: true };
  return { ...result, snapshotFallback: false };
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
  if (!settings.serverUrl || !settings.accessToken || !settings.workspaceId || !projectId || !agentId) {
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
      content = { snapshot: "", snapshotFallback: true, adapterId: "unavailable", adapterVersion: "n/a", warnings: ["Snapshot extraction could not run; created a link capture."] };
    }
    if (content.invalidSelectors?.length) {
      invalidRegionSelectors = new Set(content.invalidSelectors);
      await refreshRegionState();
      throw new Error(t("regionInvalid"));
    }
    setStatus(t("creating"));
    const payload = issuePayload(page, byId("note").value, projectId, agentId, content);
    // A user may intentionally capture the same source again, for example with
    // a new note or an explicitly-confirmed snapshot. Knowledge captures are
    // therefore allowed to bypass the server's active-duplicate guard.
    const createIssueUrl = `${normalizedServerUrl(settings.serverUrl)}/api/issues?workspace_id=${encodeURIComponent(settings.workspaceId)}&allow_duplicate=true`;
    const response = await fetch(createIssueUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const responseText = await response.text();
    const result = parseResponseJson(responseText);
    if (!response.ok) {
      const message = `Multica returned ${response.status}.`;
      await recordDiagnostic("issue_create_failed", {
        message,
        serverOrigin,
        request: captureRequestSummary(payload, page.site, Boolean(content.snapshot), {
          workspaceId: settings.workspaceId,
          allowDuplicate: true
        }),
        response: diagnosticResponse(response, responseText)
      });
      throw new Error(message);
    }
    const issue = result.issue || result;
    const reference = issue.identifier || issue.id || "issue";
    setStatus(t("created", {
      reference,
      fallback: content.snapshotFallback ? t("snapshotFallback") : ".",
      warning: content.warnings?.length ? t("adapterFallback") : ""
    }), "success");
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
    await chrome.storage.session.remove(PANEL_DRAFT_KEY);
  } finally {
    button.disabled = false;
  }
}

byId("settings-button").addEventListener("click", () => chrome.runtime.openOptionsPage());
byId("copy-diagnostics").addEventListener("click", () => copyDiagnosticReport().then(() => setStatus(t("diagnosticsCopied"), "success")).catch((error) => reportError("diagnostics_copy_failed", error)));
byId("capture-button").addEventListener("click", () => createIssue().catch((error) => reportError("capture_failed", error)));
byId("include-snapshot").addEventListener("change", (event) => {
  byId("select-region").disabled = !event.target.checked;
});
byId("clear-region").addEventListener("click", async () => {
  await chrome.storage.session.remove(REGION_RESULT_KEY);
  await refreshRegionState();
});
byId("select-region").addEventListener("click", async () => {
  if (!byId("include-snapshot").checked) return;
  try {
    if (isSidePanel) await startRegionPicker();
    else await openSidePanelForRegion();
  } catch (error) {
    if (!isSidePanel && error?.message === "side_panel_unavailable") {
      setStatus(t("sidePanelUnavailable"), "error");
      try { await startRegionPicker(); } catch (_) { await reportError("region_picker_failed", new Error(t("regionPickerUnavailable"))); }
      return;
    }
    await reportError("region_picker_failed", new Error(t("regionPickerUnavailable")));
  }
});

async function initializePopup() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  settings = stored[SETTINGS_KEY] || {};
  applyLanguage(settings.language || "en");
  await readCurrentPage();
  await loadDestinationPicker();
  if (isSidePanel) {
    const draft = (await chrome.storage.session.get(PANEL_DRAFT_KEY))[PANEL_DRAFT_KEY];
    if (draft && sameDocumentUrl(draft.url, page.url)) {
      byId("note").value = draft.note || "";
      byId("project-id").value = draft.projectId || byId("project-id").value;
      byId("agent-id").value = draft.agentId || byId("agent-id").value;
      byId("include-snapshot").checked = Boolean(draft.includeSnapshot);
      byId("select-region").disabled = !byId("include-snapshot").checked;
    }
  }
  await refreshRegionState();
}

chrome.runtime.onMessage.addListener((message) => {
  if (isSidePanel && message?.type === "region-selected") refreshRegionState();
});

initializePopup().catch((error) => reportError("popup_initialize_failed", error));
