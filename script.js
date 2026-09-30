document.documentElement.classList.add("js");

// CK Shades full international number (digits only, no "+", spaces or dashes).
const WHATSAPP_NUMBER = "2347046640309";
const DEFAULT_WHATSAPP_MESSAGE = "Hello CK Shades, I'd love to know more about the collection.";

// Direct-chat CTAs (floating button, footer chat link, closing CTA) get their
// WhatsApp handoff here. Product CTAs carry data-order-product, and anything
// pointing at an in-page anchor is an internal link: those are never rewritten
// to wa.me, so a product "Shop Now" button can never open WhatsApp directly.
const whatsappLinks = document.querySelectorAll(
  "[data-whatsapp]:not([data-order-product]):not([href^='#'])"
);
whatsappLinks.forEach((link) => {
  const message = link.dataset.whatsapp || DEFAULT_WHATSAPP_MESSAGE;
  link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
});

const menuToggle = document.querySelector(".mobile-toggle");
const mobileMenu = document.querySelector("#mobile-menu");

function closeMobileMenu() {
  if (!menuToggle || !mobileMenu) return;
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open navigation menu");
  mobileMenu.hidden = true;
}

if (menuToggle && mobileMenu) {
  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Open navigation menu" : "Close navigation menu");
    mobileMenu.hidden = isOpen;
  });

  mobileMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });

  document.addEventListener("click", (event) => {
    const clickedInsideMenu = mobileMenu.contains(event.target);
    const clickedToggle = menuToggle.contains(event.target);
    if (!mobileMenu.hidden && !clickedInsideMenu && !clickedToggle) closeMobileMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileMenu();
  });

  const desktopLayout = window.matchMedia("(min-width: 881px)");
  desktopLayout.addEventListener?.("change", (event) => {
    if (event.matches) closeMobileMenu();
  });
}

const year = document.querySelector("[data-current-year]");
if (year) year.textContent = String(new Date().getFullYear());

/* ─── Order / Enquiry form ─── */

const orderForm = document.getElementById("order-form");

if (orderForm) {
  const fields = {
    name: orderForm.querySelector("#order-name"),
    phone: orderForm.querySelector("#order-phone"),
    product: orderForm.querySelector("#order-product"),
    message: orderForm.querySelector("#order-message"),
  };

  function clearErrors() {
    orderForm.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));
    orderForm.querySelectorAll(".field-error").forEach((el) => el.remove());
  }

  function showFieldError(input, msg) {
    input.classList.add("has-error");
    const err = document.createElement("p");
    err.className = "field-error";
    err.textContent = msg;
    err.setAttribute("role", "alert");
    input.parentElement.appendChild(err);
  }

  function validate() {
    clearErrors();
    let valid = true;

    if (!fields.name.value.trim()) {
      showFieldError(fields.name, "Please enter your name.");
      valid = false;
    }

    const phone = fields.phone.value.replace(/[\s\-()]/g, "");
    if (!phone) {
      showFieldError(fields.phone, "Please enter a phone number.");
      valid = false;
    } else if (phone.replace(/\+/g, "").length < 7) {
      showFieldError(fields.phone, "Please enter a valid phone number.");
      valid = false;
    }

    return valid;
  }

  function buildMessage() {
    const name = fields.name.value.trim();
    const phone = fields.phone.value.trim();
    const product = fields.product.value;
    const message = fields.message.value.trim();

    // The greeting is deliberately plain ASCII. It used to end with a waving-hand
    // emoji, whose 4 raw UTF-8 bytes were the only non-ASCII content in the whole
    // message: at the first hop that did not preserve UTF-8 exactly it came out as
    // U+FFFD, the replacement character. The greeting must stay free of characters
    // that can be mangled in transit.
    let text = `Hello CK Shades!\n\nMy name is ${name}.`;
    text += `\nPhone: ${phone}`;

    if (product) {
      text += `\nI'm interested in: ${product}`;
    } else {
      text += `\nI'd love to learn more about your collection.`;
    }

    if (message) {
      text += `\n\n${message}`;
    }

    text += `\n\nLooking forward to hearing from you!`;

    // Final guard: drop any U+FFFD that could still be introduced elsewhere in the
    // pipeline, so the handoff can never carry a broken glyph. Written as an escape
    // sequence so the check itself is pure ASCII and immune to the same problem.
    return text.replace(/\uFFFD/g, "");
  }

  // The Google Sheets record mirrors exactly what the customer selected and
  // typed. Product may be "" (the field is optional); "colour" is the selected
  // frame's colourway description, derived in colourForProduct().
  function buildLeadPayload() {
    const product = fields.product.value;
    return {
      name: fields.name.value.trim(),
      phone: fields.phone.value.trim(),
      product,
      colour: colourForProduct(product),
      message: fields.message.value.trim(),
    };
  }

  orderForm.addEventListener("submit", (e) => {
    e.preventDefault();

    if (!validate()) {
      const firstError = orderForm.querySelector(".has-error");
      if (firstError) firstError.focus();
      return;
    }

    const text = buildMessage();
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

    // The WhatsApp handoff happens first, synchronously: the customer never
    // waits for Google Sheets.
    window.open(url, "_blank", "noopener");

    // Record the lead in the CK Shades Google Sheet (see the "Google Sheets
    // lead recording" section). Fire-and-forget: the request starts here but
    // runs entirely in the background, retries itself, and is guarded so it
    // can never delay, break or replace the WhatsApp handoff above. If it
    // ultimately fails, the lead is queued locally and re-sent later, so it
    // is never silently lost.
    try {
      sendLeadToSheets(buildLeadPayload()).catch((error) => {
        console.warn("[CK Shades] Unexpected error while recording the enquiry.", error);
      });
    } catch (error) {
      console.warn("[CK Shades] Could not start the Google Sheets lead recording.", error);
    }

    // Show success state
    orderForm.classList.add("is-sent");

    const success = document.createElement("div");
    success.className = "form-success is-visible";
    success.setAttribute("role", "status");
    success.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg><span>Your enquiry is ready in WhatsApp. Complete sending it there!</span>';
    orderForm.appendChild(success);
  });
}

/* ─── Google Sheets lead recording ─── */

// On every valid submission the enquiry is also POSTed — as JSON — to this
// Google Apps Script Web App, which appends a row to the CK Shades leads
// spreadsheet (Date | Name | Phone | Product | Colour/Style | Message |
// Status; the script stamps Date and generates Status "New" itself).
//
// Ground rules, in order of importance:
//   1. The WhatsApp handoff is the customer-facing channel and always runs
//      first, synchronously. This recording is never allowed to delay it.
//   2. The recording is fire-and-forget: failures are logged and retried in
//      the background, never surfaced as a broken page.
//   3. A lead that still cannot be delivered is queued in localStorage and
//      re-sent on the next page load (or when connectivity returns), so no
//      lead is silently lost.
//
// The request is deliberately a CORS "simple request": the JSON string is
// sent in a text/plain body. Apps Script Web Apps do not answer CORS
// preflights, so a real application/json Content-Type would make browsers
// block the request before it ever reached the script.
const LEADS_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbx7sDpaG5r6VkHSAhmMyVb0mfLZF1n0a1125sFd8U4hBD9bAcKuoSlL3VT8dD4f2F5M/exec";
const LEADS_QUEUE_KEY = "ck-shades:pending-leads";
const LEADS_MAX_QUEUE = 25;
const LEADS_MAX_ATTEMPTS = 3;
const LEADS_RETRY_DELAYS_MS = [1000, 3000]; // wait before retry 2 and retry 3
const LEADS_REQUEST_TIMEOUT_MS = 15000;

// "Noir 01 — $190" → the frame's colourway description ("Sculpted black
// acetate · Smoke lens"), read from the matching product card so it stays in
// sync with the page content. Returns "" when no frame is selected or the
// value matches no card.
function colourForProduct(productValue) {
  const key = frameKey(productValue); // function declaration below (hoisted)
  if (!key) return "";

  for (const cta of document.querySelectorAll("[data-order-product]")) {
    if (frameKey(cta.dataset.orderProduct) !== key) continue;
    const description = cta.closest(".product-card")?.querySelector(".product-description");
    if (description) return description.textContent.replace(/\s+/g, " ").trim();
  }
  return "";
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// One delivery attempt. Resolves true on any 2xx response, throws otherwise
// (non-2xx status, network/CORS failure, timeout).
function postLeadAttempt(payload) {
  if (typeof fetch !== "function") {
    return Promise.reject(new Error("fetch() is not available in this browser"));
  }

  // Abort a hung request so the retry loop can move on. Apps Script cold
  // starts can be slow, so the cap is generous.
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), LEADS_REQUEST_TIMEOUT_MS)
    : null;

  return fetch(LEADS_ENDPOINT, {
    method: "POST",
    // text/plain carrying a JSON string (see the comment above the constants).
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    // Let the request outlive the tab if the customer closes it right after
    // WhatsApp opens.
    keepalive: true,
    signal: controller ? controller.signal : undefined,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Leads endpoint responded with HTTP ${response.status}`);
      }
      return true;
    })
    .finally(() => {
      if (timeoutId !== null) clearTimeout(timeoutId);
    });
}

// Up to LEADS_MAX_ATTEMPTS tries with a short backoff between them. Resolves
// true once delivered, false if every attempt failed.
async function deliverLead(payload) {
  for (let attempt = 1; attempt <= LEADS_MAX_ATTEMPTS; attempt += 1) {
    try {
      await postLeadAttempt(payload);
      return true;
    } catch (error) {
      if (attempt < LEADS_MAX_ATTEMPTS) {
        await sleep(LEADS_RETRY_DELAYS_MS[attempt - 1] ?? 2000);
      } else {
        console.warn(
          `[CK Shades] Could not record the enquiry in Google Sheets after ${LEADS_MAX_ATTEMPTS} attempts. It has been queued and will be re-sent automatically.`,
          error
        );
      }
    }
  }
  return false;
}

function readLeadQueue() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEADS_QUEUE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry.id === "string" && entry.payload);
  } catch {
    return [];
  }
}

function writeLeadQueue(entries) {
  try {
    window.localStorage.setItem(LEADS_QUEUE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

function newLeadId() {
  return `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function enqueueLead(payload) {
  const entries = readLeadQueue();
  entries.push({ id: newLeadId(), payload });

  // The queue must never grow unbounded; drop the oldest if it somehow fills.
  while (entries.length > LEADS_MAX_QUEUE) {
    entries.shift();
    console.warn("[CK Shades] Lead queue overflow: the oldest undelivered lead was dropped.");
  }

  if (!writeLeadQueue(entries)) {
    // Storage is unavailable — leave an explicit breadcrumb in the console
    // rather than losing the lead silently.
    console.warn("[CK Shades] Lead could not be queued locally (storage unavailable).", payload);
    return false;
  }
  console.info(`[CK Shades] Lead queued for retry on the next page load (${entries.length} pending).`);
  return true;
}

function sendLeadToSheets(payload) {
  return deliverLead(payload).then((delivered) => {
    if (!delivered) enqueueLead(payload);
  });
}

// Re-send leads queued by earlier visits. One attempt per lead per flush; the
// next page load or "online" event provides further chances, so a busy failure
// loop is never needed.
let flushingLeadQueue = false;

async function flushQueuedLeads() {
  if (flushingLeadQueue) return;
  const entries = readLeadQueue();
  if (entries.length === 0) return;

  flushingLeadQueue = true;
  try {
    for (const entry of entries) {
      try {
        if (await postLeadAttempt(entry.payload)) {
          // Remove only this entry; leads enqueued meanwhile are preserved.
          writeLeadQueue(readLeadQueue().filter((queued) => queued.id !== entry.id));
        }
      } catch {
        // Stays queued for a later flush.
      }
    }
  } finally {
    flushingLeadQueue = false;
  }
}

flushQueuedLeads().catch((error) => {
  console.warn("[CK Shades] Could not re-send queued leads.", error);
});
window.addEventListener("online", () => {
  flushQueuedLeads().catch((error) => {
    console.warn("[CK Shades] Could not re-send queued leads.", error);
  });
});

/* ─── Product CTAs → the existing order / enquiry form ─── */

// Every product CTA (the image link and the "Shop Now" button) is an internal
// link to #order that carries the frame name in data-order-product. Clicking one
// must never open WhatsApp: it scrolls to the existing form and preselects the
// frame there. WhatsApp is only opened later, by the form's own submit handler.
//
// The markup already provides href="#order", so the flow still works without
// JavaScript — this only upgrades it with the preselection and a deterministic
// smooth scroll.

const ORDER_SECTION_ID = "order";
const ORDER_FORM_ID = "order-form";
const PRODUCT_FIELD_ID = "order-product";
const WHATSAPP_URL_PATTERN =
  /^https?:\/\/(?:www\.)?(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|whatsapp\.com)\//i;

// "Noir 01 — $190" → "noir 01", so a card and its <option> can be matched even
// if one of them had its price edited without the other.
function frameKey(label) {
  return String(label)
    .split(/[—–]|\s-\s/)
    .shift()
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function selectFrame(label) {
  const field = document.getElementById(PRODUCT_FIELD_ID);
  if (!field || !label) return false;

  const options = Array.from(field.options);
  const match =
    options.find((option) => option.value === label) ||
    options.find((option) => option.value && frameKey(option.value) === frameKey(label));

  if (!match) return false;
  if (field.value !== match.value) {
    field.value = match.value;
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return true;
}

function focusOrderForm() {
  const form = document.getElementById(ORDER_FORM_ID);
  if (!form || typeof form.focus !== "function") return;
  if (!form.hasAttribute("tabindex")) form.setAttribute("tabindex", "-1");
  // preventScroll keeps the smooth scroll above uninterrupted.
  form.focus({ preventScroll: true });
}

function handleProductCtaClick(event) {
  // Leave modified clicks (open in new tab, save link, …) to the browser.
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const target = document.getElementById(ORDER_SECTION_ID) || document.getElementById(ORDER_FORM_ID);
  if (!target || typeof target.scrollIntoView !== "function") return; // fall back to the native #order link

  // Preselect before scrolling, so the customer sees their frame already chosen.
  if (!selectFrame(event.currentTarget.dataset.orderProduct)) return;

  event.preventDefault();

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });

  // Keep the address bar in step with the anchor without stacking history entries.
  if (window.history?.replaceState) window.history.replaceState(null, "", `#${ORDER_SECTION_ID}`);

  focusOrderForm();
}

document.querySelectorAll("[data-order-product]").forEach((cta) => {
  // Defence in depth: if a product CTA is ever wired to WhatsApp again, put it
  // back on the internal link instead of letting the click open a chat.
  if (WHATSAPP_URL_PATTERN.test(cta.getAttribute("href") || "")) {
    cta.setAttribute("href", `#${ORDER_SECTION_ID}`);
  }
  cta.addEventListener("click", handleProductCtaClick);
});

/* ─── Reveal-on-scroll ─── */

const revealItems = document.querySelectorAll("[data-reveal]");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (prefersReducedMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      root: null,
      threshold: 0.12,
      rootMargin: "0px 0px -36px 0px",
    }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}
