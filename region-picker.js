/* One-shot DOM region picker. This file is injected only after a popup action. */
(function (root) {
  "use strict";

  const SESSION_KEY = "__multicaRegionPickerSession";
  const RESULT_KEY = "multicaPendingRegionDescriptor";
  const OVERLAY_ATTRIBUTE = "data-multica-region-picker";

  function cssEscape(value) {
    if (root.CSS?.escape) return root.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
  }

  // Prefer a unique id, then use a bounded nth-of-type path. It is deliberately
  // a locator only: no text, attributes (apart from a unique id), or HTML leave
  // the page during selection.
  function selectorFor(element) {
    if (element.id && document.querySelectorAll(`#${cssEscape(element.id)}`).length === 1) return `#${cssEscape(element.id)}`;
    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement) {
      const tag = node.localName.toLowerCase();
      const siblings = Array.from(node.parentElement?.children || []).filter((sibling) => sibling.localName === node.localName);
      parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag);
      const candidate = parts.join(" > ");
      if (document.querySelectorAll(candidate).length === 1) return candidate;
      node = node.parentElement;
    }
    return `html > ${parts.join(" > ")}`;
  }

  function elementLabel(element) {
    const id = element.id ? `#${element.id}` : "";
    const className = typeof element.className === "string" && element.className.trim()
      ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
    return `${element.localName.toLowerCase()}${id || className}`.slice(0, 80);
  }

  function start() {
    const previous = root[SESSION_KEY];
    if (previous) previous.cancel("restarted");
    if (!document.documentElement || !document.body) return Promise.resolve({ ok: false, reason: "page_unavailable" });

    let resolve;
    const completed = new Promise((done) => { resolve = done; });
    const overlay = document.createElement("div");
    overlay.setAttribute(OVERLAY_ATTRIBUTE, "");
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "fixed", zIndex: "2147483647", pointerEvents: "none", border: "2px solid #2563eb",
      background: "rgba(37, 99, 235, 0.15)", boxSizing: "border-box", display: "none"
    });
    const hint = document.createElement("div");
    hint.setAttribute(OVERLAY_ATTRIBUTE, "");
    hint.setAttribute("role", "status");
    hint.setAttribute("aria-live", "polite");
    Object.assign(hint.style, {
      position: "fixed", zIndex: "2147483647", pointerEvents: "none", background: "#172554", color: "#fff",
      font: "12px/1.35 system-ui, sans-serif", padding: "4px 7px", borderRadius: "4px", maxWidth: "280px", display: "none"
    });
    document.documentElement.append(overlay, hint);

    let candidate = null;
    const listeners = [];
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      listeners.push(() => target.removeEventListener(type, handler, options));
    };
    const isPickerNode = (node) => node instanceof Element && node.closest(`[${OVERLAY_ATTRIBUTE}]`);
    const position = (element) => {
      const rect = element.getBoundingClientRect();
      Object.assign(overlay.style, { display: "block", top: `${Math.max(0, rect.top)}px`, left: `${Math.max(0, rect.left)}px`, width: `${Math.max(0, rect.width)}px`, height: `${Math.max(0, rect.height)}px` });
      hint.textContent = `${elementLabel(element)} — selected; Alt+↑ parent; Enter confirm; Esc cancel`;
      Object.assign(hint.style, { display: "block", top: `${Math.max(0, rect.top - 28)}px`, left: `${Math.max(0, rect.left)}px` });
    };
    const choose = (element) => {
      if (!element || isPickerNode(element)) return;
      candidate = element;
      position(element);
    };
    const finish = async (result) => {
      if (!root[SESSION_KEY]) return;
      listeners.splice(0).forEach((remove) => remove());
      overlay.remove();
      hint.remove();
      delete root[SESSION_KEY];
      if (result.ok) {
        try {
          // Injected scripts run in an untrusted content-script context, where
          // storage.session is not available by default. Let the extension's
          // trusted worker persist this non-content descriptor instead.
          const stored = await chrome.runtime?.sendMessage?.({ type: "store-region-descriptor", descriptor: result.descriptor });
          if (!stored?.ok) {
            const previous = (await chrome.storage.session.get(RESULT_KEY))[RESULT_KEY] || [];
            const retained = previous.filter((descriptor) => descriptor && descriptor.url === result.descriptor.url && descriptor.selector !== result.descriptor.selector);
            await chrome.storage.session.set({ [RESULT_KEY]: [...retained, result.descriptor] });
            chrome.runtime?.sendMessage?.({ type: "region-selected" });
          }
        } catch (_) { /* the caller still receives the non-sensitive descriptor */ }
      }
      resolve(result);
    };
    const cancel = (reason = "cancelled") => finish({ ok: false, reason });
    root[SESSION_KEY] = { cancel };

    listen(document, "mousemove", (event) => choose(document.elementFromPoint(event.clientX, event.clientY)), true);
    listen(document, "click", (event) => {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (!target || isPickerNode(target)) return;
      event.preventDefault();
      event.stopPropagation();
      choose(target);
    }, true);
    listen(document, "keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); cancel(); return; }
      if (event.altKey && event.key === "ArrowUp" && candidate?.parentElement) {
        event.preventDefault();
        event.stopPropagation();
        choose(candidate.parentElement);
      }
      if (event.key === "Enter" && candidate) {
        event.preventDefault();
        event.stopPropagation();
        finish({ ok: true, descriptor: { url: location.href, selector: selectorFor(candidate) } });
      }
    }, true);
    return completed;
  }

  root.MulticaRegionPicker = { start, RESULT_KEY };
})(globalThis);
