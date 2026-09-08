// The action popup asks this worker to open a panel associated with its active
// tab. Keeping the API call here also lets the popup fall back cleanly on
// browsers that do not implement Side Panel.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "open-capture-side-panel") return;
  const tabId = Number(message.tabId || sender.tab?.id);
  if (!Number.isInteger(tabId) || !chrome.sidePanel?.open) {
    sendResponse({ ok: false, reason: "unavailable" });
    return;
  }
  chrome.sidePanel.open({ tabId })
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false, reason: "open_failed" }));
  return true;
});
