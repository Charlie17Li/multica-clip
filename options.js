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

async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] || {};
  byId("server-url").value = settings.serverUrl || "";
  byId("access-token").value = settings.accessToken || "";
  byId("project-id").value = settings.projectId || "";
  byId("agent-id").value = settings.agentId || "";
}

async function saveSettings(event) {
  event.preventDefault();
  const settings = {
    serverUrl: normalizedServerUrl(byId("server-url").value),
    accessToken: byId("access-token").value.trim(),
    projectId: byId("project-id").value.trim(),
    agentId: byId("agent-id").value.trim()
  };
  const serverUrl = new URL(settings.serverUrl);
  const granted = await chrome.permissions.request({ origins: [`${serverUrl.origin}/*`] });
  if (!granted) throw new Error("Server access permission is required to create issues.");
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  setStatus("Settings saved.", "success");
}

byId("settings-form").addEventListener("submit", (event) => saveSettings(event).catch((error) => setStatus(error.message, "error")));
loadSettings().catch((error) => setStatus(error.message, "error"));
