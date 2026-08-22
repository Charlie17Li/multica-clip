const SETTINGS_KEY = "multicaCaptureSettings";
const byId = (id) => document.getElementById(id);

function normalizedServerUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function setStatus(message, kind = "") {
  const element = byId("status");
  element.textContent = message;
  element.className = kind;
}

function addDestination(destination = {}) {
  const fragment = byId("destination-template").content.cloneNode(true);
  fragment.querySelector(".destination-domain").value = destination.domain || "";
  fragment.querySelector(".destination-project-id").value = destination.projectId || "";
  fragment.querySelector(".destination-agent-id").value = destination.agentId || "";
  fragment.querySelector(".remove-destination").addEventListener("click", (event) => event.currentTarget.closest(".destination").remove());
  byId("destination-list").append(fragment);
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
  byId("server-url").value = settings.serverUrl || "";
  byId("access-token").value = settings.accessToken || "";
  const destinations = settings.destinations || (settings.projectId && settings.agentId
    ? [{ domain: "*", projectId: settings.projectId, agentId: settings.agentId }]
    : [{ domain: "*" }]);
  destinations.forEach(addDestination);
}

async function saveSettings(event) {
  event.preventDefault();
  const destinations = destinationsFromForm();
  if (!destinations.length || destinations.some(({ domain, projectId, agentId }) => !domain || !projectId || !agentId)) {
    throw new Error("Add a domain, project ID, and agent ID for every destination.");
  }
  if (destinations.some(({ domain }) => domain !== "*" && !/^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/.test(domain))) {
    throw new Error("Domains must be hostnames, *.hostnames, or *.");
  }
  if (new Set(destinations.map(({ domain }) => domain)).size !== destinations.length) {
    throw new Error("Each domain can have only one destination.");
  }
  const settings = {
    serverUrl: normalizedServerUrl(byId("server-url").value),
    accessToken: byId("access-token").value.trim(),
    destinations
  };
  const serverUrl = new URL(settings.serverUrl);
  const granted = await chrome.permissions.request({ origins: [`${serverUrl.origin}/*`] });
  if (!granted) throw new Error("Server access permission is required to create issues.");
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  setStatus("Settings saved.", "success");
}

byId("settings-form").addEventListener("submit", (event) => saveSettings(event).catch((error) => setStatus(error.message, "error")));
byId("add-destination").addEventListener("click", () => addDestination());
loadSettings().catch((error) => setStatus(error.message, "error"));
