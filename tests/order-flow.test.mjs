/**
 * CK Shades — shopping flow tests.
 *
 * These tests load the real index.html, run the real script.js inside a DOM, and
 * assert the exact user flow:
 *
 *   1. clicking any product "Shop Now" CTA does NOT open WhatsApp
 *   2. it scrolls to the existing order/enquiry form
 *   3. it preselects the clicked frame in the existing Product field
 *   4. the form fields themselves belong to the customer
 *   5. WhatsApp is only opened after a valid form submission
 *   6. the WhatsApp handoff goes to the configured CK Shades number
 *   7. the direct-chat CTAs (floating button, footer link, closing CTA) still open WhatsApp
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const HTML = read("index.html");
const SCRIPT = read("script.js");

const WHATSAPP_NUMBER = "2347046640309";
const WHATSAPP_URL_PREFIX = `https://wa.me/${WHATSAPP_NUMBER}?text=`;

const PRODUCTS = [
  { name: "Noir 01", price: "$190", value: "Noir 01 — $190" },
  { name: "Sienna 02", price: "$185", value: "Sienna 02 — $185" },
  { name: "Forma 03", price: "$195", value: "Forma 03 — $195" },
  { name: "Sol 04", price: "$210", value: "Sol 04 — $210" },
];

/** Boots index.html + script.js in a jsdom window and records side effects. */
function boot({ mutate, reducedMotion = false } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error));
  virtualConsole.on("error", (message) => errors.push(new Error(String(message))));

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

  mutate?.(window.document);
  window.eval(SCRIPT);

  return {
    dom,
    window,
    document: window.document,
    scrolls,
    opened,
    errors,
    /** Any renderer-level navigation failure, e.g. a browser navigating to wa.me. */
    navigationErrors: () =>
      errors.filter((error) => /not implemented.*navigation/i.test(error.message ?? String(error))),
  };
}

const ctasFor = (scope, productName) =>
  [...scope.querySelectorAll(`[data-order-product]`)].filter((cta) =>
    cta.dataset.orderProduct.startsWith(productName)
  );

const productSelectValue = (document) => document.getElementById("order-product").value;

function fillForm(document, { name = "Ada Obi", phone = "+234 801 234 5678", message = "" } = {}) {
  document.getElementById("order-name").value = name;
  document.getElementById("order-phone").value = phone;
  document.getElementById("order-message").value = message;
}

function submit(document) {
  const form = document.getElementById("order-form");
  form.dispatchEvent(new document.defaultView.Event("submit", { bubbles: true, cancelable: true }));
  return form;
}

/* ─────────────────────────── 1. Product CTA markup ─────────────────────────── */

test("all 4 products expose two internal CTAs (image link + Shop Now button)", () => {
  const { document } = boot();
  for (const product of PRODUCTS) {
    const ctas = ctasFor(document, product.name);
    assert.equal(ctas.length, 2, `${product.name} should have an image CTA and a Shop Now CTA`);

    const shops = ctas.filter((cta) => cta.classList.contains("product-shop"));
    assert.equal(shops.length, 1, `${product.name} should have exactly one Shop Now button`);
    assert.match(shops[0].textContent, /Shop Now/i);
  }
});

test("no product CTA links to WhatsApp or the raw number", () => {
  const { document } = boot();
  for (const cta of document.querySelectorAll("[data-order-product]")) {
    const href = cta.getAttribute("href") ?? "";
    assert.doesNotMatch(href, /wa\.me|whatsapp|api\.whatsapp|\d{10,}/i, `unexpected WhatsApp href: ${href}`);
    assert.equal(href, "#order", "product CTAs must be internal links to the order form");
    assert.equal(cta.hasAttribute("data-whatsapp"), false, "product CTAs must not carry data-whatsapp");
    assert.notEqual(cta.getAttribute("target"), "_blank", "product CTAs must not open a new tab");
  }
});

test("the configured WhatsApp number still lives in script.js", () => {
  assert.match(SCRIPT, new RegExp(`WHATSAPP_NUMBER\\s*=\\s*"${WHATSAPP_NUMBER}"`));
});

/* ─────────────────── 2. Click → form, no WhatsApp, preselect ────────────────── */

for (const product of PRODUCTS) {
  test(`clicking "${product.name}" Shop Now opens the form with ${product.value} preselected`, () => {
    const { document, window, opened, scrolls, navigationErrors } = boot();

    assert.equal(productSelectValue(document), "", "form starts with no frame selected");

    const [shopCta] = ctasFor(document, product.name).filter((cta) => cta.classList.contains("product-shop"));
    shopCta.click();

    // 3. correct frame preselected
    assert.equal(productSelectValue(document), product.value);

    // 1. WhatsApp is NOT opened by a Shop Now click
    assert.deepEqual(opened, [], "Shop Now must not open WhatsApp");
    assert.deepEqual(navigationErrors(), [], "Shop Now must not navigate away from the page");
    assert.doesNotMatch(window.location.href, /wa\.me|whatsapp/i);

    // 2. the page moves to the order form section
    assert.equal(scrolls.length, 1, "expected exactly one scroll to the order form");
    assert.equal(scrolls[0].element.id, "order", "scroll target must be the existing order section");
    assert.equal(scrolls[0].options.block, "start");
    assert.equal(scrolls[0].options.behavior, "smooth");
  });

  test(`clicking the "${product.name}" product image selects ${product.value}`, () => {
    const { document, opened, scrolls } = boot();

    const imageCta = ctasFor(document, product.name).find((cta) =>
      cta.classList.contains("product-image-link")
    );
    imageCta.click();

    assert.equal(productSelectValue(document), product.value);
    assert.deepEqual(opened, []);
    assert.equal(scrolls.length, 1);
    assert.equal(scrolls[0].element.id, "order");
  });
}

test("selecting a second frame replaces the previous selection", () => {
  const { document } = boot();
  ctasFor(document, "Noir 01")[0].click();
  assert.equal(productSelectValue(document), "Noir 01 — $190");
  ctasFor(document, "Sol 04")[0].click();
  assert.equal(productSelectValue(document), "Sol 04 — $210");
});

test("the preselection also works when the CTA is activated from the keyboard", () => {
  const { document, opened } = boot();
  const cta = ctasFor(document, "Forma 03")[0];
  // A keyboard activation is a plain click with no modifier keys.
  cta.dispatchEvent(new document.defaultView.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  assert.equal(productSelectValue(document), "Forma 03 — $195");
  assert.deepEqual(opened, []);
});

test("modifier-clicks are left to the browser (open in new tab keeps the native link)", () => {
  const { document, window } = boot();
  const cta = ctasFor(document, "Noir 01")[0];
  cta.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true })
  );
  // The click is not hijacked, so the browser's own "open in new tab" behaviour wins.
  assert.equal(cta.getAttribute("href"), "#order");
});

test("focus lands on the order form so the preselection is announced", () => {
  const { document, window } = boot();
  ctasFor(document, "Noir 01")[0].click();

  const form = document.getElementById("order-form");
  assert.equal(window.document.activeElement, form, "focus should move to the existing order form");
  assert.ok(form.contains(document.getElementById("order-product")));
});

test("scrolling respects a reduced-motion preference", () => {
  const { document, scrolls } = boot({ reducedMotion: true });
  ctasFor(document, "Noir 01")[0].click();
  assert.equal(scrolls.length, 1);
  assert.equal(scrolls[0].options.behavior, "auto", "reduced motion must not use smooth scrolling");
});

/* ────────────────── 3. WhatsApp only opens on valid submission ──────────────── */

test("submitting the form opens WhatsApp with the preselected frame", () => {
  const { document, opened } = boot();

  ctasFor(document, "Sienna 02")[0].click();
  assert.deepEqual(opened, [], "still no WhatsApp on the CTA click");

  fillForm(document, { name: "Ada Obi", phone: "+234 801 234 5678", message: "Gift wrap please" });
  submit(document);

  assert.equal(opened.length, 1, "WhatsApp opens after a successful submit");
  const [call] = opened;
  assert.equal(call.target, "_blank");
  assert.ok(call.url.startsWith(WHATSAPP_URL_PREFIX), `unexpected WhatsApp URL: ${call.url}`);

  const text = decodeURIComponent(call.url.slice(WHATSAPP_URL_PREFIX.length));
  assert.match(text, /Ada Obi/);
  assert.match(text, /\+234 801 234 5678/);
  assert.match(text, /Sienna 02 — \$185/);
  assert.match(text, /Gift wrap please/);
});

test("the WhatsApp message is cleanly encoded (no replacement character)", () => {
  const { document, opened } = boot();

  ctasFor(document, "Noir 01")[0].click();
  fillForm(document, { name: "Ada Obi", phone: "+234 801 234 5678" });
  submit(document);

  assert.equal(opened.length, 1);
  const text = decodeURIComponent(opened[0].url.slice(WHATSAPP_URL_PREFIX.length));

  // The reported bug: the greeting ended with a waving-hand emoji whose raw bytes
  // degraded to U+FFFD ("Hello CK Shades! <replacement character>") on the way to WhatsApp.
  assert.equal(text.includes("\uFFFD"), false, "the handoff must not carry the replacement character");
  assert.doesNotMatch(text, /[\u{10000}-\u{10FFFF}]/u, "the handoff must not rely on non-BMP characters");

  // The greeting is plain ASCII, and the rest of the structure is unchanged.
  assert.equal(text.split("\n")[0], "Hello CK Shades!");
  assert.equal(
    text,
    "Hello CK Shades!\n\nMy name is Ada Obi.\nPhone: +234 801 234 5678\n" +
      "I'm interested in: Noir 01 \u2014 $190\n\nLooking forward to hearing from you!"
  );
});

test("a replacement character from any other source never reaches the handoff", () => {
  const { document, opened } = boot();

  ctasFor(document, "Sol 04")[0].click();
  fillForm(document, { message: "Please gift wrap \uFFFD it" });
  submit(document);

  assert.equal(opened.length, 1);
  const text = decodeURIComponent(opened[0].url.slice(WHATSAPP_URL_PREFIX.length));
  assert.equal(text.includes("\uFFFD"), false, "the broken glyph is stripped before the handoff");
  assert.match(text, /Please gift wrap  it/);
});

for (const product of PRODUCTS) {
  test(`end-to-end: ${product.name} is ordered through the form without a detour to WhatsApp`, () => {
    const { document, opened, navigationErrors } = boot();

    const [shopCta] = ctasFor(document, product.name).filter((cta) =>
      cta.classList.contains("product-shop")
    );
    shopCta.click();

    assert.deepEqual(opened, [], "no WhatsApp before the form is submitted");
    assert.equal(productSelectValue(document), product.value);

    fillForm(document, { name: "Ada Obi", phone: "+234 801 234 5678" });
    submit(document);

    assert.deepEqual(navigationErrors(), []);
    assert.equal(opened.length, 1, "exactly one WhatsApp handoff, after submit");
    const text = decodeURIComponent(opened[0].url.slice(WHATSAPP_URL_PREFIX.length));
    assert.match(text, new RegExp(product.name));
    assert.match(text, new RegExp(product.price.replace("$", "\\$")));
  });
}

test("an invalid submission does not open WhatsApp", () => {
  const { document, opened } = boot();

  ctasFor(document, "Sol 04")[0].click();
  fillForm(document, { name: "  ", phone: "" });
  submit(document);

  assert.deepEqual(opened, [], "WhatsApp must stay closed when validation fails");
  assert.equal(document.querySelectorAll(".field-error").length, 2, "both required fields are flagged");
  assert.equal(productSelectValue(document), "Sol 04 — $210", "the selection is preserved");
});

test("the WhatsApp number used at submit time is the configured CK Shades number", () => {
  const { document, opened } = boot();
  fillForm(document);
  submit(document);

  assert.equal(opened.length, 1);
  assert.equal(new URL(opened[0].url).origin + new URL(opened[0].url).pathname, `https://wa.me/${WHATSAPP_NUMBER}`);
});

/* ──────────────── 4. Direct WhatsApp CTAs keep working unchanged ────────────── */

test("the floating button, footer link and closing CTA still open WhatsApp directly", () => {
  const { document } = boot();

  const directCtas = [
    document.querySelector(".whatsapp-float"),
    document.querySelector(".footer-whatsapp"),
    document.querySelector(".closing-cta .button"),
  ];

  for (const cta of directCtas) {
    assert.ok(cta, "direct WhatsApp CTA is missing from the page");
    assert.ok(cta.hasAttribute("data-whatsapp"), "direct CTAs keep their prefilled message");

    const expected = cta.dataset.whatsapp;
    assert.ok(
      cta.href.startsWith(WHATSAPP_URL_PREFIX),
      `direct CTA should point at the CK Shades WhatsApp number, got: ${cta.href}`
    );
    assert.equal(decodeURIComponent(cta.href.slice(WHATSAPP_URL_PREFIX.length)), expected);
    assert.equal(cta.target, "_blank");
    assert.match(cta.rel, /noopener/);
  }
});

test("direct WhatsApp CTAs are never mistaken for product CTAs", () => {
  const { document } = boot();
  for (const cta of document.querySelectorAll("[data-whatsapp]")) {
    assert.equal(
      cta.hasAttribute("data-order-product"),
      false,
      "a link must not be both a direct chat CTA and a product CTA"
    );
  }
});

/* ────────────────────────── 5. Regression guards ──────────────────────────── */

test("a product CTA carrying data-whatsapp can still never open WhatsApp", () => {
  const { document, window, opened, navigationErrors } = boot({
    mutate: (doc) => {
      // Simulate the exact regression that was reported: a product CTA wired to WhatsApp.
      const cta = doc.querySelector('[data-order-product^="Noir 01"]');
      cta.setAttribute("data-whatsapp", "Hello CK Shades, I'd love to shop the Noir 01 sunglasses.");
      cta.setAttribute("href", "https://wa.me/2347046640309?text=Hello");
      cta.setAttribute("target", "_blank");
    },
  });

  const cta = document.querySelector('[data-order-product^="Noir 01"]');
  cta.click();

  assert.equal(cta.getAttribute("href"), "#order", "the WhatsApp href is normalised back to the form");
  assert.equal(productSelectValue(document), "Noir 01 — $190");
  assert.deepEqual(opened, []);
  assert.deepEqual(navigationErrors(), []);
  assert.doesNotMatch(window.location.href, /wa\.me/i);
});

test("the selection survives price/label drift between the card and the option", () => {
  const { document } = boot({
    mutate: (doc) => {
      // The price on the card changed but the <option> label was not updated.
      doc.querySelector('#order-product option[value^="Noir 01"]').textContent = "Noir 01 — $250";
      doc.querySelector('#order-product option[value^="Noir 01"]').value = "Noir 01 — $250";
    },
  });

  ctasFor(document, "Noir 01")[0].click();
  assert.equal(productSelectValue(document), "Noir 01 — $250", "the frame is still matched by name");
});

test("an unknown product data value degrades to a plain #order link", () => {
  const { document, opened, navigationErrors } = boot({
    mutate: (doc) => {
      doc.querySelector('[data-order-product^="Noir 01"]').dataset.orderProduct = "Ghost 99 — $1";
    },
  });

  const cta = document.querySelector('[data-order-product^="Ghost 99"]');
  assert.doesNotThrow(() => cta.click());
  assert.deepEqual(opened, []);
  assert.equal(productSelectValue(document), "", "nothing is invented when the frame is unknown");
  assert.deepEqual(navigationErrors(), [], "the native #order link still works");
});

/* ─────────────────────────── 6. Form is untouched ─────────────────────────── */

test("the page loads and runs without JavaScript errors", () => {
  const { errors } = boot();
  assert.deepEqual(
    errors.map((error) => error.message ?? String(error)),
    []
  );
});

test("the order form keeps its existing fields and does not gain new ones", () => {
  const { document } = boot();

  const fields = [...document.querySelectorAll("#order-form input, #order-form select, #order-form textarea")];
  assert.deepEqual(
    fields.map((field) => field.name),
    ["name", "phone", "product", "message"]
  );
  assert.equal(document.querySelectorAll("#order-form button[type=submit]").length, 1);
  assert.equal(document.querySelectorAll("#order-form").length, 1, "exactly one order form exists");
  assert.equal(document.querySelectorAll("dialog, .modal").length, 0, "no modal is introduced");
});
