const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const popup = fs.readFileSync(path.join(__dirname, "..", "popup.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
const sidePanel = fs.readFileSync(path.join(__dirname, "..", "side-panel.html"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "..", "service-worker.js"), "utf8");

test("popup only enables region selection after explicit snapshot confirmation", () => {
  assert.match(popup, /select-region"\)\.disabled = !event\.target\.checked/);
  assert.match(popup, /if \(!byId\("include-snapshot"\)\.checked\) return;/);
});

test("popup keeps ordered region locators and reads them only while creating a confirmed snapshot", () => {
  assert.match(popup, /if \(!includeSnapshot\) return \{ snapshot: ""/);
  assert.match(popup, /const includeSnapshot = byId\("include-snapshot"\)\.checked;[\s\S]*readOptionalPageContent\(includeSnapshot\)/);
  assert.match(popup, /Array\.isArray\(stored\[REGION_RESULT_KEY\]\)/);
  assert.match(popup, /args: \[tab\.url, descriptors\.map\(\(descriptor\) => descriptor\.selector\)\]/);
  assert.match(popup, /if \(descriptors\.length\) await chrome\.storage\.session\.remove\(REGION_RESULT_KEY\);/);
  assert.match(popup, /invalidSelectors/);
  assert.match(popup, /invalidRegionSelectors = new Set\(content\.invalidSelectors\)/);
  assert.match(popup, /item\.className = invalidRegionSelectors\.has/);
  assert.match(popup, /selected\.contains\(root\)/);
  assert.doesNotMatch(popup, /outerHTML/);
  const descriptionBody = popup.match(/function issueDescription[\s\S]*?\n}\n\nfunction issuePayload/)?.[0] || "";
  assert.doesNotMatch(descriptionBody, /selector/);
});

test("Side Panel renders ordered regions with individual removal controls", () => {
  assert.match(sidePanel, /id="region-list"/);
  assert.match(popup, /descriptors\.map\(\(descriptor, index\)/);
  assert.match(popup, /removeRegion/);
});

test("popup hands the confirmed capture draft to a tab-associated Side Panel", () => {
  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.equal(manifest.background.service_worker, "service-worker.js");
  assert.equal(manifest.side_panel.default_path, "side-panel.html");
  assert.match(popup, /PANEL_DRAFT_KEY/);
  assert.match(popup, /type: "open-capture-side-panel", tabId: tab\.id/);
  assert.match(worker, /chrome\.sidePanel\.open\(\{ tabId \}\)/);
  assert.match(sidePanel, /data-capture-surface="side-panel"/);
});

test("Side Panel keeps the confirmation gate and refreshes after a selected region", () => {
  assert.match(popup, /if \(isSidePanel\) await startRegionPicker\(\)/);
  assert.match(popup, /isSidePanel && message\?\.type === "region-selected"/);
  assert.match(popup, /byId\("select-region"\)\.disabled = !byId\("include-snapshot"\)\.checked/);
  assert.match(popup, /side_panel_unavailable/);
});
