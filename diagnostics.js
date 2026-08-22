const DIAGNOSTICS_KEY = "multicaCaptureDiagnostics";
const MAX_DIAGNOSTIC_EVENTS = 20;

function safeDiagnosticText(value) {
  return String(value || "Unknown error")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/(token|access_token|authorization)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s]+/gi, "[redacted URL]")
    .slice(0, 500);
}

function safeDiagnosticValue(value, key = "") {
  if (/(token|authorization|description|note|snapshot|body|url|title)/i.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => safeDiagnosticValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 20).map(([name, item]) => [name, safeDiagnosticValue(item, name)]));
  }
  return typeof value === "string" ? safeDiagnosticText(value) : value;
}

function diagnosticResponse(response, text) {
  let body = safeDiagnosticText(text);
  try {
    body = safeDiagnosticValue(JSON.parse(text));
  } catch (_) {
    // A non-JSON error body is still useful after URL/token redaction.
  }
  return { status: response.status, statusText: response.statusText, contentType: response.headers.get("content-type") || "", body };
}

function parseResponseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch (_) {
    return {};
  }
}

function captureRequestSummary(payload, pageHost, snapshot) {
  return {
    endpoint: "/api/issues",
    projectId: payload.project_id,
    assigneeType: payload.assignee_type,
    assigneeId: payload.assignee_id,
    pageHost,
    captureMode: snapshot ? "snapshot" : "link",
    descriptionLength: payload.description.length,
    titleLength: payload.title.length
  };
}

function diagnosticContext(extra = {}) {
  return { at: new Date().toISOString(), extensionVersion: chrome.runtime.getManifest().version, browser: navigator.userAgent, ...extra };
}

async function recordDiagnostic(event, details = {}) {
  const stored = await chrome.storage.local.get(DIAGNOSTICS_KEY);
  const entries = Array.isArray(stored[DIAGNOSTICS_KEY]) ? stored[DIAGNOSTICS_KEY] : [];
  entries.push(diagnosticContext({ event, ...details }));
  await chrome.storage.local.set({ [DIAGNOSTICS_KEY]: entries.slice(-MAX_DIAGNOSTIC_EVENTS) });
}

async function diagnosticReport() {
  const stored = await chrome.storage.local.get(DIAGNOSTICS_KEY);
  const entries = Array.isArray(stored[DIAGNOSTICS_KEY]) ? stored[DIAGNOSTICS_KEY] : [];
  return ["```text", "Multica Knowledge Capture diagnostic report", "This report excludes access tokens, notes, page snapshots, and full page URLs.", `Generated: ${new Date().toISOString()}`, "", ...entries.map((entry) => JSON.stringify(entry)), "```"].join("\n");
}

async function copyDiagnosticReport() {
  await navigator.clipboard.writeText(await diagnosticReport());
}
