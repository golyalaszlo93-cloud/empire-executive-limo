const bookingForm = document.querySelector(".booking-form");
const applePayButton = document.querySelector("#apple-pay-button");
const cardPayButton = document.querySelector("#card-pay-button");
const alternatePayments = document.querySelectorAll("[data-pay]");
const config = window.EMPIRE_LIMO_CONFIG || {};

bookingForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(bookingForm);
  const request = {
    createdAt: new Date().toISOString(),
    tripType: formData.get("trip-type") || "",
    pickup: formData.get("pickup") || "",
    dropoff: formData.get("dropoff") || "",
    date: formData.get("date") || "",
    time: formData.get("time") || "",
    passengers: formData.get("passengers") || "",
    vehicle: formData.get("vehicle") || "",
    contact: formData.get("contact") || "",
  };

  saveBookingRequest(request);
  bookingForm.querySelector(".form-note").textContent =
    "Quote request ready. Your email app will open so dispatch can confirm availability and pricing.";
  window.location.href = buildBookingMailto(request);
});

function saveBookingRequest(request) {
  const key = "empireLimoQuoteRequests";
  const existing = JSON.parse(localStorage.getItem(key) || "[]");
  existing.unshift(request);
  localStorage.setItem(key, JSON.stringify(existing.slice(0, 25)));
}

function buildBookingMailto(request) {
  const to = config.email || "bookings@empireexecutivelimo.com";
  const subject = encodeURIComponent("Ride quote request - " + (request.date || "date TBD"));
  const body = encodeURIComponent([
    "New ride quote request",
    "",
    "Trip type: " + request.tripType,
    "Pickup: " + request.pickup,
    "Drop-off: " + request.dropoff,
    "Date: " + request.date,
    "Time: " + request.time,
    "Passengers: " + request.passengers,
    "Vehicle: " + request.vehicle,
    "Contact: " + request.contact,
    "",
    "Source: " + (config.website || window.location.href),
  ].join("\n"));
  return "mailto:" + to + "?subject=" + subject + "&body=" + body;
}

function openPayment(url, fallbackMessage) {
  if (!url) {
    alert(fallbackMessage);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function configurePaymentButtons() {
  applePayButton?.addEventListener("click", () => {
    openPayment(
      config.stripeCheckoutUrl,
      "Stripe Checkout link is not connected yet. Create the Reservation Deposit payment link in Stripe, then add it to config.js."
    );
  });

  cardPayButton?.addEventListener("click", () => {
    openPayment(
      config.stripeCheckoutUrl,
      "Stripe Checkout link is not connected yet. Create the Reservation Deposit payment link in Stripe, then add it to config.js."
    );
  });
}

alternatePayments.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const provider = link.dataset.pay;
    const urls = {
      paypal: config.paypalCheckoutUrl,
      venmo: config.venmoCheckoutUrl || config.paypalCheckoutUrl,
      cashapp: config.cashAppPayUrl,
    };
    openPayment(urls[provider], link.textContent.trim() + " is not connected yet.");
  });
});

configurePaymentButtons();
