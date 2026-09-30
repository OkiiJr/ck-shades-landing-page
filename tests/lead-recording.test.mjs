/**
 * CK Shades — Google Sheets lead recording tests.
 *
 * These tests load the real index.html, run the real script.js inside a DOM,
 * and assert the lead-recording behaviour around the existing WhatsApp flow:
 *
 *   1. a valid submission POSTs the exact lead JSON to the Apps Script endpoint
 *   2. the payload mirrors the customer's input (incl. the frame colourway)
 *   3. invalid submissions never contact Google Sheets
 *   4. the WhatsApp handoff is never delayed or broken by the Sheets request
 *   5. failures are retried, then queued locally — never silently lost
 *   6. queued leads are re-sent on the next page load / "online" event
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  LEADS_ENDPOINT,
  LEADS_QUEUE_KEY,
  SCRIPT,
  WHATSAPP_URL_PREFIX,
  boot,
  ctasFor,
  fillForm,
  queuedLeads,
  submit,
  waitFor,
} from "./helpers/dom.mjs";

const MAX_ATTEMPTS = 3;

// Colourway copy from the product cards in index.html — hardcoded here so the
// derivation logic is pinned to a contract, not to itself.
const COLOURWAYS = {
  "Noir 01": "Sculpted black acetate · Smoke lens",
  "Sienna 02": "Warm tortoise acetate · Amber lens",
  "Forma 03": "Olive acetate · Soft square silhouette",
  "Sol 04": "Champagne metal · Soft smoke lens",
};

/** fetch stub that answers every request with HTTP 200. */
function okFetch() {
  const impl = (url, options) => {
    impl.calls.push({ url: String(url), options });
    return Promise.resolve({ ok: true, status: 200 });
  };
  impl.calls = [];
  return impl;
}

/** fetch stub that fails the first `failFirst` requests, then succeeds. */
function flakyFetch({ failFirst = 0, mode = "reject" } = {}) {
  const impl = (url, options) => {
    impl.calls.push({ url: String(url), options });
    if (impl.calls.length <= failFirst) {
      return mode === "reject"
        ? Promise.reject(new Error("simulated network failure"))
        : Promise.resolve({ ok: false, status: 500 });
    }
    return Promise.resolve({ ok: true, status: 200 });
  };
  impl.calls = [];
  return impl;
}

/** fetch stub that always fails (network error). */
function failingFetch() {
  return flakyFetch({ failFirst: Infinity });
}

/** fetch stub that never settles (hung request / black-holed network). */
function hangingFetch() {
  const impl = (url, options) => {
    impl.calls.push({ url: String(url), options });
    return new Promise(() => {});
  };
  impl.calls = [];
  return impl;
}

function fillAndSubmit(document, overrides = {}) {
  ctasFor(document, "Noir 01")[0].click();
  fillForm(document, overrides);
  submit(document);
}

/* ─────────────────────────── 1. The happy path ─────────────────────────── */

test("script.js posts leads to the provided Apps Script endpoint", () => {
  assert.match(SCRIPT, /LEADS_ENDPOINT\s*=\s*"https:\/\/script\.google\.com\/macros\/s\//);
});

test("a valid submission POSTs the exact lead JSON to the endpoint and still opens WhatsApp", async () => {
  const fetchImpl = okFetch();
  const { document, window, opened } = boot({ fetchImpl });

  fillAndSubmit(document, { name: "Ada Obi", phone: "+234 801 234 5678", message: "Gift wrap please" });

  await waitFor(() => fetchImpl.calls.length === 1);

  const call = fetchImpl.calls[0];
  assert.equal(call.url, LEADS_ENDPOINT, "the lead goes to the Apps Script Web App");
  assert.equal(call.options.method, "POST");

  // Apps Script Web Apps do not answer CORS preflights, so the JSON must travel
  // in a CORS-safelisted (simple request) Content-Type.
  assert.equal(call.options.headers["Content-Type"], "text/plain;charset=utf-8");

  // The payload is the exact JSON structure the sheet expects — Date and Status
  // are stamped by the Apps Script, not by the page.
  const payload = JSON.parse(call.options.body);
  assert.deepEqual(payload, {
    name: "Ada Obi",
    phone: "+234 801 234 5678",
    product: "Noir 01 — $190",
    colour: COLOURWAYS["Noir 01"],
    message: "Gift wrap please",
  });
  assert.deepEqual(Object.keys(payload), ["name", "phone", "product", "colour", "message"]);

  // The WhatsApp handoff is untouched.
  assert.equal(opened.length, 1);
  assert.ok(opened[0].url.startsWith(WHATSAPP_URL_PREFIX));

  // The customer-facing success state is unchanged.
  assert.ok(document.getElementById("order-form").classList.contains("is-sent"));
  assert.ok(document.querySelector("#order-form .form-success"));

  // Nothing needed queueing.
  assert.deepEqual(queuedLeads(window), []);
});

for (const [frame, colourway] of Object.entries(COLOURWAYS)) {
  test(`the Colour/Style value for ${frame} is the frame's colourway description`, async () => {
    const fetchImpl = okFetch();
    const { document } = boot({ fetchImpl });

    ctasFor(document, frame)[0].click();
    fillForm(document);
    submit(document);

    await waitFor(() => fetchImpl.calls.length === 1);
    const payload = JSON.parse(fetchImpl.calls[0].options.body);
    assert.equal(payload.product.startsWith(frame), true);
    assert.equal(payload.colour, colourway);
  });
}

test("submitting without a frame records an empty product and colour", async () => {
  const fetchImpl = okFetch();
  const { document } = boot({ fetchImpl });

  fillForm(document, { name: "Ada Obi", phone: "+234 801 234 5678" });
  submit(document);

  await waitFor(() => fetchImpl.calls.length === 1);
  const payload = JSON.parse(fetchImpl.calls[0].options.body);
  assert.equal(payload.product, "");
  assert.equal(payload.colour, "");
});

test("the payload mirrors the customer's input, trimmed like the WhatsApp message", async () => {
  const fetchImpl = okFetch();
  const { document } = boot({ fetchImpl });

  fillAndSubmit(document, { name: "  Ada Obi ", phone: " +234 801 234 5678 ", message: "  Gift wrap  " });

  await waitFor(() => fetchImpl.calls.length === 1);
  const payload = JSON.parse(fetchImpl.calls[0].options.body);
  assert.equal(payload.name, "Ada Obi");
  assert.equal(payload.phone, "+234 801 234 5678");
  assert.equal(payload.message, "Gift wrap");
});

test("an invalid submission never contacts Google Sheets and queues nothing", async () => {
  const fetchImpl = okFetch();
  const { document, window, opened } = boot({ fetchImpl });

  fillForm(document, { name: "  ", phone: "" });
  submit(document);
  await waitFor(() => document.querySelectorAll(".field-error").length === 2);
  await waitFor(() => false, { timeout: 60, message: "settle" }).catch(() => {});

  assert.equal(fetchImpl.calls.length, 0, "no request is sent when validation fails");
  assert.deepEqual(opened, [], "WhatsApp stays closed too");
  assert.deepEqual(queuedLeads(window), []);
});

/* ─────────────── 2. WhatsApp is never delayed or broken by Sheets ─────────────── */

test("a hung Google Sheets request never blocks the WhatsApp handoff", () => {
  const fetchImpl = hangingFetch();
  const { document, opened } = boot({ fetchImpl });

  fillAndSubmit(document);

  // Asserted without awaiting anything: WhatsApp opens in the same tick as the
  // submit, even though the lead request is still hanging.
  assert.equal(opened.length, 1, "WhatsApp opened immediately");
  assert.ok(opened[0].url.startsWith(WHATSAPP_URL_PREFIX));
  assert.ok(document.getElementById("order-form").classList.contains("is-sent"));
});

test("a Google Sheets outage does not break the WhatsApp handoff", async () => {
  const fetchImpl = failingFetch();
  const { document, window, opened, errors, warnings } = boot({ fetchImpl });

  fillAndSubmit(document);

  assert.equal(opened.length, 1, "WhatsApp opened even though every request will fail");
  await waitFor(() => queuedLeads(window).length === 1, {
    message: "the failed lead is queued locally",
  });

  // The customer still sees the normal success state.
  assert.ok(document.getElementById("order-form").classList.contains("is-sent"));
  assert.ok(document.querySelector("#order-form .form-success"));

  // The failure is reported for diagnostics — but nothing crashes.
  assert.equal(errors.length, 0, "no unhandled errors or promise rejections");
  assert.ok(
    warnings.some((entry) => entry.includes("Google Sheets")),
    "the failure is logged as a warning for diagnostics"
  );
});

/* ─────────────────── 3. Retries and the local lead queue ─────────────────── */

test("a failing endpoint is retried before the lead is queued", async () => {
  const fetchImpl = failingFetch();
  const { document, window, opened } = boot({ fetchImpl });

  fillAndSubmit(document);

  await waitFor(() => queuedLeads(window).length === 1);
  assert.equal(fetchImpl.calls.length, MAX_ATTEMPTS, "all retries are used before queueing");
  assert.equal(opened.length, 1);
  assert.deepEqual(queuedLeads(window)[0].payload.product, "Noir 01 — $190");
});

test("an HTTP 500 response is treated exactly like a network failure", async () => {
  const fetchImpl = flakyFetch({ failFirst: Infinity, mode: "status" });
  const { document, window, opened, errors } = boot({ fetchImpl });

  fillAndSubmit(document);

  await waitFor(() => queuedLeads(window).length === 1);
  assert.equal(fetchImpl.calls.length, MAX_ATTEMPTS);
  assert.equal(opened.length, 1, "the WhatsApp handoff is unaffected");
  assert.equal(errors.length, 0, "no unhandled errors or promise rejections");
});

test("a lead that succeeds on a retry is not queued", async () => {
  const fetchImpl = flakyFetch({ failFirst: 1 });
  const { document, window, opened } = boot({ fetchImpl });

  fillAndSubmit(document);

  await waitFor(() => fetchImpl.calls.length === 2);
  await waitFor(() => false, { timeout: 150, message: "settle" }).catch(() => {});

  assert.equal(opened.length, 1);
  assert.deepEqual(queuedLeads(window), [], "the delivered lead is not queued");
});

test("queued leads are re-sent automatically on the next page load", async () => {
  const seeded = [
    {
      id: "seed-1",
      payload: {
        name: "Queued Customer",
        phone: "+234 802 000 0001",
        product: "Sol 04 — $210",
        colour: COLOURWAYS["Sol 04"],
        message: "From an earlier visit",
      },
    },
  ];
  const fetchImpl = okFetch();
  const { window } = boot({
    fetchImpl,
    mutate: (doc, win) => win.localStorage.setItem(LEADS_QUEUE_KEY, JSON.stringify(seeded)),
  });

  await waitFor(() => queuedLeads(window).length === 0, { message: "the queue is drained" });
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, LEADS_ENDPOINT);
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].options.body), seeded[0].payload);
});

test("a queued lead that fails again stays queued for the next visit", async () => {
  const seeded = [
    { id: "seed-1", payload: { name: "A", phone: "+2348000000000", product: "", colour: "", message: "" } },
  ];
  const fetchImpl = failingFetch();
  const { window } = boot({
    fetchImpl,
    mutate: (doc, win) => win.localStorage.setItem(LEADS_QUEUE_KEY, JSON.stringify(seeded)),
  });

  await waitFor(() => fetchImpl.calls.length >= 1);
  await waitFor(() => false, { timeout: 100, message: "settle" }).catch(() => {});

  const queued = queuedLeads(window);
  assert.equal(queued.length, 1, "the lead is still queued");
  assert.equal(queued[0].id, "seed-1");
  assert.deepEqual(queued[0].payload, seeded[0].payload);
});

test("leads queued after load are re-sent when connectivity returns", async () => {
  const fetchImpl = okFetch();
  const { window } = boot({ fetchImpl });

  // Simulate a lead that was queued while the page was already open.
  window.localStorage.setItem(
    LEADS_QUEUE_KEY,
    JSON.stringify([
      { id: "offline-1", payload: { name: "B", phone: "+2348000000001", product: "", colour: "", message: "" } },
    ])
  );

  window.dispatchEvent(new window.Event("online"));

  await waitFor(() => queuedLeads(window).length === 0, { message: "the online event flushed the queue" });
  assert.equal(fetchImpl.calls.length, 1);
});

test("the local queue is capped so it can never grow unbounded", async () => {
  const fetchImpl = failingFetch();
  const { document, window } = boot({ fetchImpl });

  // Outrun the cap of 25 with failing submissions.
  for (let i = 0; i < 30; i += 1) {
    fillForm(document, { name: `Customer ${i}`, phone: `+23480000000${String(i).padStart(2, "0")}` });
    submit(document);
  }

  await waitFor(() => fetchImpl.calls.length >= 30 * MAX_ATTEMPTS, { timeout: 4000 });

  const queued = queuedLeads(window);
  assert.equal(queued.length, 25, "the queue holds at most 25 leads");
  assert.equal(
    queued.some((entry) => entry.payload.name === "Customer 29"),
    true,
    "the newest lead is kept"
  );
  assert.equal(
    queued.some((entry) => entry.payload.name === "Customer 0"),
    false,
    "the oldest leads are dropped first"
  );
});

/* ─────────────────────────── 4. Diagnostics hygiene ─────────────────────────── */

test("page boot and a happy-path submission produce no errors or unexpected warnings", async () => {
  const fetchImpl = okFetch();
  const { document, window, errors, warnings } = boot({ fetchImpl });

  fillAndSubmit(document);
  await waitFor(() => fetchImpl.calls.length === 1);
  await waitFor(() => false, { timeout: 100, message: "settle" }).catch(() => {});

  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});
