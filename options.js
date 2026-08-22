const SETTINGS_KEY = "multicaCaptureSettings";
const byId = (id) => document.getElementById(id);
let catalog = { workspaces: [], projects: [], agents: [] };
let savedWorkspaceId = "";

function normalizedServerUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function setStatus(message, kind = "") {
  const element = byId("status");
  element.textContent = message;
  element.className = kind;
}

function optionLabel(record) {
  return record.title || record.name || record.slug || record.id;
}

function setOptions(select, records, selectedId, placeholder) {
  select.replaceChildren(new Option(placeholder, ""));
  records.forEach((record) => select.add(new Option(optionLabel(record), record.id)));
  select.value = selectedId || "";
  select.disabled = records.length === 0;
}

function destinationSelects(element) {
  return {
    project: element.querySelector(".destination-project-id"),
    agent: element.querySelector(".destination-agent-id")
  };
}

function populateDestination(element, destination = {}) {
  const { project, agent } = destinationSelects(element);
  setOptions(project, catalog.projects, destination.projectId || element.dataset.projectId || project.value, t("selectProject"));
  setOptions(agent, catalog.agents, destination.agentId || element.dataset.agentId || agent.value, t("selectAgent"));
}

function addDestination(destination = {}) {
  const fragment = byId("destination-template").content.cloneNode(true);
  const destinationElement = fragment.querySelector(".destination");
  destinationElement.querySelector(".destination-domain").value = destination.domain || "";
  destinationElement.dataset.projectId = destination.projectId || "";
  destinationElement.dataset.agentId = destination.agentId || "";
  destinationElement.querySelector(".destination-project-id").addEventListener("change", (event) => {
    destinationElement.dataset.projectId = event.currentTarget.value;
  });
  destinationElement.querySelector(".destination-agent-id").addEventListener("change", (event) => {
    destinationElement.dataset.agentId = event.currentTarget.value;
  });
  destinationElement.querySelector(".remove-destination").addEventListener("click", (event) => event.currentTarget.closest(".destination").remove());
  byId("destination-list").append(fragment);
  applyLanguage(byId("language").value || "en");
  populateDestination(byId("destination-list").lastElementChild, destination);
}

function connectionSettings() {
  return {
    serverUrl: normalizedServerUrl(byId("server-url").value),
    accessToken: byId("access-token").value.trim()
  };
}

async function requestServerPermission(serverUrl, requestPermission) {
  const serverOrigin = new URL(serverUrl).origin;
  const origins = [`${serverOrigin}/*`];
  const granted = requestPermission
    ? await chrome.permissions.request({ origins })
    : await chrome.permissions.contains({ origins });
  if (!granted) throw new Error(t("serverAccessRequired"));
}

async function fetchApi(path, settings) {
  const response = await fetch(`${settings.serverUrl}${path}`, {
    headers: { "Authorization": `Bearer ${settings.accessToken}` }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || result.error || `Multica returned ${response.status}.`);
  return result;
}

async function loadWorkspaceCatalog(settings, selectedWorkspaceId) {
  const workspaceId = selectedWorkspaceId || byId("workspace-id").value;
  if (!workspaceId) {
    catalog.projects = [];
    catalog.agents = [];
  } else {
    const query = `?workspace_id=${encodeURIComponent(workspaceId)}`;
    const [projectResponse, agents] = await Promise.all([
      fetchApi(`/api/projects${query}`, settings),
      fetchApi(`/api/agents${query}`, settings)
    ]);
    catalog.projects = projectResponse.projects || [];
    catalog.agents = Array.isArray(agents) ? agents : agents.agents || [];
  }
  document.querySelectorAll(".destination").forEach((element) => populateDestination(element));
}

async function loadDestinations(requestPermission = true) {
  const settings = connectionSettings();
  if (!settings.serverUrl || !settings.accessToken) throw new Error(t("enterServer"));
  await requestServerPermission(settings.serverUrl, requestPermission);
  setStatus(t("loadDestinations") + "…");
  catalog.workspaces = await fetchApi("/api/workspaces", settings);
  if (!Array.isArray(catalog.workspaces) || !catalog.workspaces.length) throw new Error(t("noWorkspaces"));
  const workspaceSelect = byId("workspace-id");
  const previousWorkspaceId = workspaceSelect.value || savedWorkspaceId;
  setOptions(workspaceSelect, catalog.workspaces, previousWorkspaceId, t("selectWorkspace"));
  if (!workspaceSelect.value) workspaceSelect.value = catalog.workspaces[0].id;
  savedWorkspaceId = workspaceSelect.value;
  await loadWorkspaceCatalog(settings);
  setStatus(t("destinationsLoaded"), "success");
}

function destinationsFromForm() {
  return Array.from(document.querySelectorAll(".destination")).map((element) => ({
    domain: element.querySelector(".destination-domain").value.trim().toLowerCase().replace(/\.+$/, ""),
    projectId: element.querySelector(".destination-project-id").value.trim(),
    agentId: element.querySelector(".destination-agent-id").value.trim()
  }));
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] || {};
  byId("language").value = settings.language || "en";
  applyLanguage(byId("language").value);
  byId("server-url").value = settings.serverUrl || "";
  byId("access-token").value = settings.accessToken || "";
  savedWorkspaceId = settings.workspaceId || "";
  const destinations = settings.destinations || (settings.projectId && settings.agentId
    ? [{ domain: "*", projectId: settings.projectId, agentId: settings.agentId }]
    : [{ domain: "*" }]);
  destinations.forEach(addDestination);
  if (settings.serverUrl && settings.accessToken) {
    loadDestinations(false).catch(() => setStatus(t("loadToChoose")));
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const destinations = destinationsFromForm();
  if (!destinations.length || destinations.some(({ domain, projectId, agentId }) => !domain || !projectId || !agentId)) {
    throw new Error(t("incompleteDestination"));
  }
  if (destinations.some(({ domain }) => domain !== "*" && !/^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/.test(domain))) {
    throw new Error(t("invalidDomain"));
  }
  if (new Set(destinations.map(({ domain }) => domain)).size !== destinations.length) {
    throw new Error(t("duplicateDomain"));
  }
  const settings = {
    ...connectionSettings(),
    language: byId("language").value,
    workspaceId: byId("workspace-id").value,
    destinations
  };
  if (!settings.workspaceId) throw new Error(t("selectWorkspace"));
  const serverUrl = new URL(settings.serverUrl);
  const granted = await chrome.permissions.request({ origins: [`${serverUrl.origin}/*`] });
  if (!granted) throw new Error(t("createPermission"));
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  setStatus(t("settingsSaved"), "success");
}

byId("settings-form").addEventListener("submit", (event) => saveSettings(event).catch((error) => setStatus(error.message, "error")));
byId("add-destination").addEventListener("click", () => addDestination());
byId("load-destinations").addEventListener("click", () => loadDestinations().catch((error) => setStatus(error.message, "error")));
byId("workspace-id").addEventListener("change", () => {
  savedWorkspaceId = byId("workspace-id").value;
  loadWorkspaceCatalog(connectionSettings()).catch((error) => setStatus(error.message, "error"));
});
byId("language").addEventListener("change", () => {
  applyLanguage(byId("language").value);
  document.querySelectorAll(".destination").forEach((element) => populateDestination(element));
});
loadSettings().catch((error) => setStatus(error.message, "error"));
