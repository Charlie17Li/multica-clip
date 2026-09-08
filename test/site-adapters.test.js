const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

test("uses an explicitly selected root for generic extraction", () => {
  const selected = { cloneNode: () => ({ innerText: "Selected only", querySelectorAll: () => [] }) };
  const result = adapters.extract("https://example.test/post", documentWithText("Whole page"), selected);
  assert.equal(result.snapshot, "Selected only");
});

test("sanitizes a selected generic region with the same exclusions as a whole page", () => {
  const removed = [];
  const selected = {
    cloneNode: () => ({
      innerText: "Selected article text",
      querySelectorAll: (selector) => selector.split(", ").map((name) => ({ remove: () => removed.push(name) }))
    })
  };
  const result = adapters.extract("https://example.test/post", documentWithText("Whole page"), selected);
  assert.equal(result.snapshot, "Selected article text");
  assert.deepEqual(removed, ["script", "style", "noscript", "nav", "header", "footer", "aside", "form"]);
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

function v2exDocument({ title = "A fixture topic", body = "Fixture body", author = "fixture-author", node = "share", publishedAt = "2026-01-02 03:04:05 +08:00", tags = ["privacy", "testing"], replies = 2, canonicalUrl = "https://www.v2ex.com/t/4242" } = {}) {
  const header = {
    querySelector(selector) {
      if (selector.includes("member")) return { innerText: author };
      if (selector.includes("/go/")) return { innerText: node };
      if (selector.includes("span[title]")) return publishedAt ? { getAttribute: () => publishedAt } : null;
      return null;
    }
  };
  return {
    location: { href: canonicalUrl },
    querySelector(selector) {
      if (selector.includes("h1")) return title ? { innerText: title } : null;
      if (selector.includes("topic_content")) return body ? { innerText: body } : null;
      if (selector.includes(".header")) return header;
      if (selector === 'link[rel="canonical"]') return canonicalUrl ? { href: canonicalUrl } : null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "a.tag") return tags.map((value) => ({ innerText: value }));
      if (selector === ".reply_content") return Array.from({ length: replies }, () => ({ innerText: "Reply content must not be captured." }));
      return [];
    },
    body: { cloneNode: () => ({ innerText: "Generic fallback", querySelectorAll: () => [] }) }
  };
}

test("extracts a V2EX topic fixture without reply bodies", () => {
  const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "v2ex-topic.html"), "utf8");
  assert.match(fixture, /class="topic_content"/);
  const result = adapters.extract("https://www.v2ex.com/t/4242?utm_source=fixture", v2exDocument());
  assert.equal(result.adapterId, "v2ex-topic");
  assert.equal(result.adapterVersion, "1");
  assert.equal(result.snapshot, "Fixture body");
  assert.equal(result.canonicalUrl, "https://www.v2ex.com/t/4242");
  assert.deepEqual(result.metadata, { title: "A fixture topic", author: "fixture-author", node: "share", tags: ["privacy", "testing"], publishedAt: "2026-01-02 03:04:05 +08:00", replyCount: 2, topicId: "4242" });
  assert.doesNotMatch(result.snapshot, /Reply content/);
});

test("does not widen a V2EX region selection into reply text", () => {
  const topicBody = { innerText: "Topic body", contains: () => false };
  const document = v2exDocument();
  const originalQuery = document.querySelector.bind(document);
  document.querySelector = (selector) => selector.includes("topic_content") ? topicBody : originalQuery(selector);
  const result = adapters.extract("https://www.v2ex.com/t/4242", document, { innerText: "Reply text" });
  assert.equal(result.snapshot, "");
  assert.equal(result.adapterId, "v2ex-topic");
  assert.match(result.warnings[0], /outside the V2EX topic body/);
});

test("keeps V2EX reply text excluded when a region inside the topic is selected", () => {
  const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "v2ex-region.html"), "utf8");
  assert.match(fixture, /Reply text must stay excluded/);
  const topicBody = { innerText: "Topic body only", contains: (node) => node === selected };
  const selected = { innerText: "Topic body only" };
  const document = v2exDocument({ body: "Topic body only" });
  const originalQuery = document.querySelector.bind(document);
  document.querySelector = (selector) => selector.includes("topic_content") ? topicBody : originalQuery(selector);
  const result = adapters.extract("https://www.v2ex.com/t/4242", document, selected);
  assert.equal(result.snapshot, "Topic body only");
  assert.doesNotMatch(result.snapshot, /Reply text/);
});

test("keeps long code-like V2EX topic text intact", () => {
  const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "v2ex-topic-code.html"), "utf8");
  const code = "Use this:\n\nconst safe = true;\n\nFinish.";
  assert.match(fixture, /const safe = true/);
  const result = adapters.extract("https://v2ex.com/t/4243", v2exDocument({ title: "Code", body: code, canonicalUrl: "https://v2ex.com/t/4243" }));
  assert.equal(result.snapshot, code);
});

test("falls back from a malformed V2EX topic fixture", () => {
  const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "v2ex-topic-missing.html"), "utf8");
  assert.match(fixture, /Topic unavailable/);
  const result = adapters.extract("https://v2ex.com/t/4244", v2exDocument({ title: "", body: "", canonicalUrl: "https://v2ex.com/t/4244" }));
  assert.equal(result.adapterId, "generic-page-text");
  assert.equal(result.snapshot, "Generic fallback");
  assert.match(result.warnings[0], /V2EX topic title or body was unavailable/);
});
