// The action popup asks this worker to open a panel associated with its active
// tab. Keeping the API call here also lets the popup fall back cleanly on
// browsers that do not implement Side Panel.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "store-region-descriptor") {
    const descriptor = message.descriptor;
    if (!descriptor || typeof descriptor.url !== "string" || typeof descriptor.selector !== "string") {
      sendResponse({ ok: false });
      return;
    }
    chrome.storage.session.get("multicaPendingRegionDescriptor")
      .then((stored) => {
        const previous = Array.isArray(stored.multicaPendingRegionDescriptor) ? stored.multicaPendingRegionDescriptor : [];
        const retained = previous.filter((item) => item && item.url === descriptor.url && item.selector !== descriptor.selector);
        return chrome.storage.session.set({ multicaPendingRegionDescriptor: [...retained, descriptor] });
      })
      .then(() => chrome.runtime.sendMessage({ type: "region-selected" }))
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
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
