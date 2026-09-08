const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type) { this.listeners.delete(type); }
  dispatch(type, event = {}) { this.listeners.get(type)?.({ preventDefault() {}, stopPropagation() {}, ...event }); }
}

class FakeElement extends Target {
  constructor(tag = "div", id = "") {
    super(); this.localName = tag; this.id = id; this.nodeType = 1; this.style = {}; this.parentElement = null; this.children = []; this.attributes = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  append(...nodes) { nodes.forEach((node) => { node.parentElement = this; this.children.push(node); }); }
  remove() { this.parentElement && (this.parentElement.children = this.parentElement.children.filter((child) => child !== this)); this.parentElement = null; }
  closest(selector) { return selector.includes("data-multica-region-picker") && this.attributes.has("data-multica-region-picker") ? this : null; }
  getBoundingClientRect() { return { top: 5, left: 6, width: 100, height: 30 }; }
}

function pickerHarness() {
  const document = new Target();
  document.documentElement = new FakeElement("html");
  document.body = new FakeElement("body");
  document.documentElement.append(document.body);
  const target = new FakeElement("article", "chosen");
  document.body.append(target);
  document.createElement = (tag) => new FakeElement(tag);
  document.querySelectorAll = (selector) => selector === "#chosen" ? [target] : [];
  document.elementFromPoint = () => target;
  const writes = [];
  let session = {};
  const chrome = { storage: { session: {
    get: async (key) => ({ [key]: session[key] }),
    set: async (value) => { session = { ...session, ...value }; writes.push(value); }
  } } };
  const context = { document, chrome, location: { href: "https://example.test/article" }, Node: { ELEMENT_NODE: 1 }, Element: FakeElement, Promise, console };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "region-picker.js"), "utf8"), context);
  return { context, document, target, writes };
}

test("confirms only a URL and selector, then cleans up picker UI and listeners", async () => {
  const { context, document, target, writes } = pickerHarness();
  const pending = context.MulticaRegionPicker.start();
  document.dispatch("mousemove", { clientX: 1, clientY: 1 });
  document.dispatch("click", { clientX: 1, clientY: 1 });
  const result = await pending;
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, descriptor: { url: "https://example.test/article", selector: "#chosen" } });
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [{ multicaPendingRegionDescriptor: [{ url: "https://example.test/article", selector: "#chosen" }] }]);
  assert.equal(document.listeners.size, 0);
  assert.deepEqual(document.documentElement.children, [document.body]);
  assert.equal(target.outerHTML, undefined);
});

test("Esc cancels without persisting page content or a descriptor", async () => {
  const { context, document, writes } = pickerHarness();
  const pending = context.MulticaRegionPicker.start();
  document.dispatch("keydown", { key: "Escape" });
  assert.deepEqual(JSON.parse(JSON.stringify(await pending)), { ok: false, reason: "cancelled" });
  assert.deepEqual(writes, []);
  assert.equal(document.listeners.size, 0);
});

test("Alt+ArrowUp promotes the candidate to its parent before Enter confirms", async () => {
  const { context, document, target, writes } = pickerHarness();
  const parent = new FakeElement("main", "parent");
  target.parentElement.children = target.parentElement.children.filter((node) => node !== target);
  parent.append(target);
  document.body.append(parent);
  document.querySelectorAll = (selector) => selector === "#parent" ? [parent] : [];
  const pending = context.MulticaRegionPicker.start();
  document.dispatch("mousemove", { clientX: 1, clientY: 1 });
  document.dispatch("keydown", { key: "ArrowUp", altKey: true });
  document.dispatch("keydown", { key: "Enter" });
  await pending;
  assert.equal(writes[0].multicaPendingRegionDescriptor[0].selector, "#parent");
});

test("does not duplicate a selector when the same element is selected twice", async () => {
  const { context, document, writes } = pickerHarness();
  let pending = context.MulticaRegionPicker.start();
  document.dispatch("click", { clientX: 1, clientY: 1 });
  await pending;
  pending = context.MulticaRegionPicker.start();
  document.dispatch("click", { clientX: 1, clientY: 1 });
  await pending;
  assert.equal(writes[1].multicaPendingRegionDescriptor.length, 1);
});

test("restarting a picker cancels the earlier session and leaves one clean session", async () => {
  const { context, document } = pickerHarness();
  const first = context.MulticaRegionPicker.start();
  const second = context.MulticaRegionPicker.start();
  assert.deepEqual(JSON.parse(JSON.stringify(await first)), { ok: false, reason: "restarted" });
  assert.equal(document.documentElement.children.length, 3);
  document.dispatch("keydown", { key: "Escape" });
  await second;
  assert.deepEqual(document.documentElement.children, [document.body]);
  assert.equal(document.listeners.size, 0);
});

test("reports an unavailable page without installing UI or persisting a descriptor", async () => {
  const { context, document, writes } = pickerHarness();
  document.body = null;
  assert.deepEqual(JSON.parse(JSON.stringify(await context.MulticaRegionPicker.start())), { ok: false, reason: "page_unavailable" });
  assert.deepEqual(writes, []);
  assert.equal(document.listeners.size, 0);
});
