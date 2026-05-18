# Empire Executive Limo Website

Static professional limo service website.

## Open Locally

Open index.html in a browser, or serve this folder with any static server.

## Live Wiring

- Site business config lives in config.js.
- Phone is set to 323-470-1958.
- Public booking email is set to bookings@empireexecutivelimo.com.
- Booking form opens a prepared email handoff and stores recent quote requests in browser local storage.
- Payment buttons read live URLs from config.js.
- Full wiring status is tracked in ../../operations/business/transportation/limo-wiring-status.md.

## Payment Setup Needed Before Live Use

- Apple Pay and credit/debit cards: add the live Stripe Checkout or Payment Link URL to config.js.
- Apple Pay domain verification: complete the Stripe-provided domain verification step before publishing Apple Pay.
- PayPal/Venmo: add live checkout URLs to config.js when accounts are ready.
- Cash App Pay: add live Stripe/Square Cash App Pay URL to config.js when ready.
- Booking form: replace the email handoff with CRM/API capture when the backend is selected.

Current payment controls are wired to config.js but do not charge money until live payment URLs are added.

## Recommended Production Payment Stack

- Stripe: card payments and Apple Pay.
- PayPal Checkout: PayPal and Venmo.
- Cash App Pay: Stripe if eligible, otherwise Square evaluation.
- Never store raw card data in this repo or workspace.
