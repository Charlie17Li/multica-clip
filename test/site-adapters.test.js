const test = require("node:test");
const assert = require("node:assert/strict");
const adapters = require("../site-adapters.js");

function documentWithText(value) {
  const copy = { innerText: value, querySelectorAll: () => [] };
  return { body: { cloneNode: () => copy }, querySelector: () => null };
}

test.afterEach(() => adapters._resetForTests());

test("uses generic page-text extraction when no site adapter matches", () => {
  const result = adapters.extract("https://example.test/post", documentWithText("One\n\n\n\nTwo"));
  assert.equal(result.adapterId, "generic-page-text");
  assert.equal(result.adapterVersion, "1");
  assert.equal(result.snapshot, "One\n\nTwo");
  assert.deepEqual(result.warnings, []);
});

test("chooses a registered exact-site adapter without changing callers", () => {
  adapters.register({ id: "docs-example", version: "7", matches: (url) => new URL(url).hostname === "docs.example.test", extract: () => ({ snapshot: "Adapter body", canonicalUrl: "https://docs.example.test/canonical", warnings: ["Date missing."] }) });
  const result = adapters.extract("https://docs.example.test/a", documentWithText("Generic body"));
  assert.equal(result.adapterId, "docs-example");
  assert.equal(result.adapterVersion, "7");
  assert.equal(result.snapshot, "Adapter body");
  assert.equal(result.canonicalUrl, "https://docs.example.test/canonical");
  assert.deepEqual(result.warnings, ["Date missing."]);
});

test("falls back safely when a matching adapter fails or returns no text", () => {
  adapters.register({ id: "broken", version: "1", matches: () => true, extract: () => { throw new Error("unexpected DOM"); } });
  const failed = adapters.extract("https://example.test", documentWithText("Generic body"));
  assert.equal(failed.adapterId, "generic-page-text");
  assert.equal(failed.snapshot, "Generic body");
  assert.match(failed.warnings[0], /broken failed/);

  adapters._resetForTests();
  adapters.register({ id: "empty", version: "1", matches: () => true, extract: () => ({ snapshot: "" }) });
  const empty = adapters.extract("https://example.test", documentWithText("Generic body"));
  assert.equal(empty.adapterId, "generic-page-text");
  assert.match(empty.warnings[0], /empty returned no readable text/);
});
