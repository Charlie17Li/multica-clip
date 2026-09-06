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
      metadata: result?.metadata && typeof result.metadata === "object" && !Array.isArray(result.metadata) ? result.metadata : {},
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
      return fallback(result.warnings[0] || `Adapter ${adapter.id} returned no readable text; used the generic extractor.`);
    } catch (_) {
      return fallback(`Adapter ${adapter.id} failed; used the generic extractor.`);
    }
  }

  function nodeText(node) {
    return text(node?.innerText || node?.textContent || "");
  }

  function v2exTopicId(url) {
    try {
      const parsed = new URL(url);
      if (!/(^|\.)v2ex\.com$/i.test(parsed.hostname)) return "";
      return parsed.pathname.match(/^\/t\/(\d+)\/?$/)?.[1] || "";
    } catch (_) {
      return "";
    }
  }

  const v2exTopicAdapter = {
    id: "v2ex-topic",
    version: "1",
    matches: (url) => Boolean(v2exTopicId(url)),
    extract(document) {
      const title = nodeText(document.querySelector("#Main .header h1, .header h1"));
      const body = nodeText(document.querySelector("#Main .topic_content, .topic_content"));
      if (!title || !body) {
        return { snapshot: "", warnings: ["V2EX topic title or body was unavailable."] };
      }

      const topicId = v2exTopicId(document.location?.href || "") || "";
      const header = document.querySelector("#Main .header, .header");
      const authorLink = header?.querySelector?.('a[href*="/member/"]');
      const nodeLink = header?.querySelector?.('a[href*="/go/"]');
      const published = header?.querySelector?.("small.gray span[title], small .ago[title]")?.getAttribute?.("title") || "";
      const canonicalLink = document.querySelector('link[rel="canonical"]')?.href || "";
      const tags = Array.from(document.querySelectorAll("a.tag"), nodeText).filter(Boolean);
      const replyNodes = document.querySelectorAll(".reply_content");
      const metadata = {
        title,
        author: nodeText(authorLink),
        node: nodeText(nodeLink),
        tags,
        publishedAt: published,
        replyCount: replyNodes.length
      };
      if (topicId) metadata.topicId = topicId;

      const warnings = [];
      if (!metadata.author) warnings.push("V2EX topic author was unavailable.");
      if (!metadata.node) warnings.push("V2EX topic node was unavailable.");
      if (!metadata.publishedAt) warnings.push("V2EX topic publication time was unavailable.");

      // Reply bodies intentionally stay out of the default snapshot. The count
      // makes their presence explicit without collecting discussion content.
      return { snapshot: body, canonicalUrl: canonicalLink, metadata, warnings };
    }
  };

  register(v2exTopicAdapter);

  const api = {
    register,
    extract,
    selectedAdapter,
    genericAdapter,
    _resetForTests: () => {
      registry.splice(0);
      register(v2exTopicAdapter);
    }
  };
  root.MulticaSiteAdapters = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
