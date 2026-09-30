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
   over to WhatsApp, using the number configured in `script.js`.
4. The floating WhatsApp button, the footer chat link and the closing CTA are direct-chat
   links: they keep opening WhatsApp immediately with their prefilled `data-whatsapp` message.

## Tests

The shopping flow is covered by a DOM test suite (jsdom + Node's built-in test runner). It
loads the real `index.html` and runs the real `script.js`, then checks every step of the flow
for all four frames.

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
