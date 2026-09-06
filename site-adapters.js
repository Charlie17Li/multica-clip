/* global module */
(function (root) {
  "use strict";

  const MAX_SNAPSHOT_LENGTH = 100000;
  const registry = [];

  function text(value) {
    return typeof value === "string" ? value.replace(/\n{3,}/g, "\n\n").trim() : "";
  }

  function normalizeResult(result, adapter) {
    const warnings = Array.isArray(result?.warnings) ? result.warnings.filter((warning) => typeof warning === "string") : [];
    return {
      snapshot: text(result?.snapshot).slice(0, MAX_SNAPSHOT_LENGTH),
      canonicalUrl: typeof result?.canonicalUrl === "string" ? result.canonicalUrl : "",
      warnings,
      adapterId: adapter.id,
      adapterVersion: adapter.version
    };
  }

  const genericAdapter = {
    id: "generic-page-text",
    version: "1",
    matches: () => true,
    extract(document) {
      const pageRoot = document.querySelector("article, main") || document.body;
      if (!pageRoot) return { snapshot: "", warnings: ["No readable page content was found."] };
      const copy = pageRoot.cloneNode(true);
      copy.querySelectorAll("script, style, noscript, nav, header, footer, aside, form").forEach((node) => node.remove());
      const snapshot = text(copy.innerText).slice(0, MAX_SNAPSHOT_LENGTH);
      return { snapshot, warnings: snapshot ? [] : ["No readable page text was found."] };
    }
  };

  function register(adapter) {
    if (!adapter || typeof adapter.id !== "string" || !adapter.id || typeof adapter.version !== "string" || typeof adapter.matches !== "function" || typeof adapter.extract !== "function") {
      throw new TypeError("A site adapter needs id, version, matches(), and extract().");
    }
    if (adapter.id === genericAdapter.id || registry.some((entry) => entry.id === adapter.id)) {
      throw new Error(`A site adapter named ${adapter.id} is already registered.`);
    }
    registry.push(adapter);
  }

  function selectedAdapter(url) {
    return registry.find((adapter) => {
      try { return adapter.matches(url); } catch (_) { return false; }
    }) || genericAdapter;
  }

  function extract(url, document) {
    const adapter = selectedAdapter(url);
    const fallback = (warning) => {
      const result = normalizeResult(genericAdapter.extract(document), genericAdapter);
      if (warning) result.warnings.unshift(warning);
      return result;
    };
    if (adapter === genericAdapter) return fallback();
    try {
      const result = normalizeResult(adapter.extract(document), adapter);
      if (result.snapshot) return result;
      return fallback(`Adapter ${adapter.id} returned no readable text; used the generic extractor.`);
    } catch (_) {
      return fallback(`Adapter ${adapter.id} failed; used the generic extractor.`);
    }
  }

  const api = { register, extract, selectedAdapter, genericAdapter, _resetForTests: () => registry.splice(0) };
  root.MulticaSiteAdapters = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
