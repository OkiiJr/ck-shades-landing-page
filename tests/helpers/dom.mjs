/**
 * CK Shades — shared DOM test harness.
 *
 * Boots the real index.html + the real script.js inside a jsdom window and
 * records every side effect the tests care about (opened windows, scroll
 * requests, console output, fetch calls).
 *
 * Two adaptations for jsdom:
 *   - jsdom has no layout engine, so scrollIntoView is recorded, not performed.
 *   - jsdom has no network stack, so `fetch` must be supplied per test via the
 *     `fetchImpl` option (default: a stub that rejects every request).
 *
 * Background retry loops in script.js use setTimeout backoff; the harness caps
 * those delays at ~20ms so tests of the retry paths stay fast while production
 * timings are unchanged.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
export const HTML = read("index.html");
export const SCRIPT = read("script.js");

export const WHATSAPP_NUMBER = "2347046640309";
export const WHATSAPP_URL_PREFIX = `https://wa.me/${WHATSAPP_NUMBER}?text=`;

export const PRODUCTS = [
  { name: "Noir 01", price: "$190", value: "Noir 01 — $190" },
  { name: "Sienna 02", price: "$185", value: "Sienna 02 — $185" },
  { name: "Forma 03", price: "$195", value: "Forma 03 — $195" },
  { name: "Sol 04", price: "$210", value: "Sol 04 — $210" },
];

export const LEADS_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbx7sDpaG5r6VkHSAhmMyVb0mfLZF1n0a1125sFd8U4hBD9bAcKuoSlL3VT8dD4f2F5M/exec";
export const LEADS_QUEUE_KEY = "ck-shades:pending-leads";

/** Boots index.html + script.js in a jsdom window and records side effects. */
export function boot({ mutate, reducedMotion = false, fetchImpl } = {}) {
  const errors = [];
  const warnings = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error));
  virtualConsole.on("error", (message) => errors.push(new Error(String(message))));
  virtualConsole.on("warn", (...args) => warnings.push(args.map(String).join(" ")));

  const dom = new JSDOM(HTML, {
    url: "https://ckshades.example/",
    runScripts: "outside-only",
    virtualConsole,
  });

  const { window } = dom;

  // jsdom has no layout engine, so record scroll requests instead of performing them.
  const scrolls = [];
  window.Element.prototype.scrollIntoView = function scrollIntoView(options) {
    scrolls.push({ element: this, options });
  };

  const opened = [];
  window.open = (url, target, features) => {
    opened.push({ url: String(url), target, features });
    return null;
  };

  // jsdom has no fetch. Always install a deterministic stub; tests that need to
  // observe HTTP behaviour pass their own `fetchImpl`.
  const fetchCalls = [];
  window.fetch =
    fetchImpl ??
    ((url, options) => {
      fetchCalls.push({ url: String(url), options });
      return Promise.reject(new Error("no network in tests"));
    });

  // Cap backoff/sleep delays so retry loops finish quickly in tests.
  const realSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = (fn, delay, ...rest) =>
    realSetTimeout(fn, typeof delay === "number" && delay > 20 ? 20 : delay, ...rest);

  // jsdom's matchMedia always reports matches: false; let tests drive the media queries.
  const inheritedMatchMedia = window.matchMedia?.bind(window);
  const stub = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
  window.matchMedia = (query) =>
    query.includes("prefers-reduced-motion")
      ? { ...stub(query), matches: reducedMotion }
      : (inheritedMatchMedia?.(query) ?? stub(query));

  // mutate receives the document (and window, for storage seeding) after the
  // stubs are installed but before script.js runs.
  mutate?.(window.document, window);
  window.eval(SCRIPT);

  return {
    dom,
    window,
    document: window.document,
    scrolls,
    opened,
    errors,
    warnings,
    /** Fetch calls made by script.js when the test supplied its own `fetchImpl`. */
    fetchCalls,
    /** Any renderer-level navigation failure, e.g. a browser navigating to wa.me. */
    navigationErrors: () =>
      errors.filter((error) => /not implemented.*navigation/i.test(error.message ?? String(error))),
  };
}

/** Polls until `predicate()` is true; fails the test if it never gets there. */
export async function waitFor(predicate, { timeout = 2000, step = 10, message = "condition was not met in time" } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, step));
  }
  assert.ok(predicate(), `waitFor: ${message}`);
}

export const ctasFor = (scope, productName) =>
  [...scope.querySelectorAll(`[data-order-product]`)].filter((cta) =>
    cta.dataset.orderProduct.startsWith(productName)
  );

export const productSelectValue = (document) => document.getElementById("order-product").value;

export function fillForm(document, { name = "Ada Obi", phone = "+234 801 234 5678", message = "" } = {}) {
  document.getElementById("order-name").value = name;
  document.getElementById("order-phone").value = phone;
  document.getElementById("order-message").value = message;
}

export function submit(document) {
  const form = document.getElementById("order-form");
  form.dispatchEvent(new document.defaultView.Event("submit", { bubbles: true, cancelable: true }));
  return form;
}

/** The locally queued, undelivered leads for a booted window ([] if none). */
export function queuedLeads(window) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEADS_QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
