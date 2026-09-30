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

    let text = `Hello CK Shades! 👋\n\nMy name is ${name}.`;
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
    return text;
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

    window.open(url, "_blank", "noopener");

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
