const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const popup = fs.readFileSync(path.join(__dirname, "..", "popup.js"), "utf8");

test("popup only enables region selection after explicit snapshot confirmation", () => {
  assert.match(popup, /select-region"\)\.disabled = !event\.target\.checked/);
  assert.match(popup, /if \(!byId\("include-snapshot"\)\.checked\) return;/);
});

test("popup keeps a region as a temporary locator and reads it only while creating a confirmed snapshot", () => {
  assert.match(popup, /if \(!includeSnapshot\) return \{ snapshot: ""/);
  assert.match(popup, /const includeSnapshot = byId\("include-snapshot"\)\.checked;[\s\S]*readOptionalPageContent\(includeSnapshot\)/);
  assert.match(popup, /args: \[tab\.url, descriptor\?\.selector \|\| ""\]/);
  assert.match(popup, /if \(descriptor\) await chrome\.storage\.session\.remove\(REGION_RESULT_KEY\);/);
  assert.doesNotMatch(popup, /outerHTML/);
  const descriptionBody = popup.match(/function issueDescription[\s\S]*?\n}\n\nfunction issuePayload/)?.[0] || "";
  assert.doesNotMatch(descriptionBody, /selector/);
});
