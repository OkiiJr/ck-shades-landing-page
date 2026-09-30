# CK Shades landing page

A responsive, editorial-style landing page for a fictional luxury eyewear brand. Built with plain HTML, CSS and JavaScript; the page itself has no build step and no runtime dependencies (jsdom is used only to run the test suite).

## Run locally

From this folder, start any static file server. For example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Shopping flow

1. Every product card has two CTAs — the image link and the **Shop Now** button. Both are
   internal links to `#order` and carry the frame in a `data-order-product` attribute.
2. Clicking one never opens WhatsApp. It scrolls to the existing order/enquiry form and
   preselects that frame in the form's **Interested in** field.
3. The customer fills in the form and submits it. Only then does the page hand the enquiry
   over to WhatsApp, using the number configured in `script.js`. The same submission is
   also recorded in the team's Google Sheet (see below) — WhatsApp always happens first
   and is never delayed by the sheet recording.
4. The floating WhatsApp button, the footer chat link and the closing CTA are direct-chat
   links: they keep opening WhatsApp immediately with their prefilled `data-whatsapp` message.

## Lead recording (Google Sheets)

On every valid form submission the page also POSTs the enquiry to the CK Shades Google
Apps Script Web App, which appends a row to the leads spreadsheet (Date | Name | Phone |
Product | Colour/Style | Message | Status — the script stamps Date and Status "New"
itself).

- **Endpoint:** the `LEADS_ENDPOINT` constant in the “Google Sheets lead recording”
  section of `script.js`.
- **Payload:** `{ name, phone, product, colour, message }` — exactly what the customer
  entered. `colour` is the selected frame's colourway description (e.g. “Sculpted black
  acetate · Smoke lens”), read from the product card, and is empty when no frame is
  selected.
- **Content type:** the JSON string is sent as `text/plain`. Apps Script Web Apps do not
  answer CORS preflight requests, so a literal `application/json` header would be blocked
  by the browser before the script ever ran. `doPost` should read `e.postData.contents`
  and `JSON.parse` it.
- **The customer never waits:** WhatsApp opens first; the POST is fire-and-forget with up
  to 3 attempts and a request timeout. Any 2xx response counts as delivered.
- **No lead is silently lost:** if all attempts fail, the lead is queued in `localStorage`
  (capped at 25) and re-sent automatically on the next page load or when the browser comes
  back online. Failures are logged as console warnings for diagnostics; the page itself
  never breaks.

## Tests

The shopping flow is covered by a DOM test suite (jsdom + Node's built-in test runner). It
loads the real `index.html` and runs the real `script.js`, then checks every step of the flow
for all four frames. `tests/lead-recording.test.mjs` covers the Google Sheets integration
(payload shape, retry/queue behaviour, and that the WhatsApp handoff is never delayed or
broken by it); the shared harness lives in `tests/helpers/dom.mjs`.

```sh
npm install   # dev-only dependency (jsdom); the page itself still has no build step
npm test
```

## Update the placeholders

- Replace the campaign and product images in `images/` with approved CK Shades assets. The current images are generated visual placeholders.
- Edit product names, descriptions and prices in `index.html`.
- Set the real WhatsApp phone number (country code + number, digits only) in `script.js`. Each product’s **Shop Now** button opens the order form with that frame preselected (via its `data-order-product` attribute in `index.html`); submitting the form hands the enquiry off to WhatsApp. The direct-chat CTAs (floating button, footer link, closing CTA) open WhatsApp immediately with the prefilled messages in their `data-whatsapp` attributes.
- Replace the contact email, phone number and social profile URLs in the footer before launch.
- The three testimonial cards are explicitly marked as fictional sample reviews and should be replaced with approved customer reviews.

All page sections and assets are local except for the optional Google Fonts request. System fallbacks are included in `styles.css`.
