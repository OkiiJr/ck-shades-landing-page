# CK Shades landing page

A responsive, editorial-style landing page for a fictional luxury eyewear brand. Built with plain HTML, CSS and JavaScript; it has no build step or package dependencies.

## Run locally

From this folder, start any static file server. For example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Update the placeholders

- Replace the campaign and product images in `images/` with approved CK Shades assets. The current images are generated visual placeholders.
- Edit product names, descriptions and prices in `index.html`.
- Set the real WhatsApp phone number (country code + number, digits only) in `script.js`. Each product’s **Shop Now** button opens the order form with that frame preselected (via its `data-order-product` attribute in `index.html`); submitting the form hands the enquiry off to WhatsApp. The direct-chat CTAs (floating button, footer link, closing CTA) open WhatsApp immediately with the prefilled messages in their `data-whatsapp` attributes.
- Replace the contact email, phone number and social profile URLs in the footer before launch.
- The three testimonial cards are explicitly marked as fictional sample reviews and should be replaced with approved customer reviews.

All page sections and assets are local except for the optional Google Fonts request. System fallbacks are included in `styles.css`.
