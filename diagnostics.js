const DIAGNOSTICS_KEY = "multicaCaptureDiagnostics";
const MAX_DIAGNOSTIC_EVENTS = 20;

function safeDiagnosticText(value) {
  return String(value || "Unknown error")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/(token|access_token|authorization)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s]+/gi, "[redacted URL]")
    .slice(0, 500);
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
  return ["Multica Knowledge Capture diagnostic report", "This report excludes access tokens, notes, page snapshots, and full page URLs.", `Generated: ${new Date().toISOString()}`, "", ...entries.map((entry) => JSON.stringify(entry))].join("\n");
}

async function copyDiagnosticReport() {
  await navigator.clipboard.writeText(await diagnosticReport());
}
