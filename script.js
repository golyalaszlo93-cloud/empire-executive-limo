const bookingForm = document.querySelector(".booking-form");
const applePayButton = document.querySelector("#apple-pay-button");
const cardPayButton = document.querySelector("#card-pay-button");
const alternatePayments = document.querySelectorAll("[data-pay]");
const config = window.EMPIRE_LIMO_CONFIG || {};

const pricingState = {
  durationMinutes: null,
  distanceText: "",
  tipPercent: 0,
};

const estimateNodes = {
  routeTime: document.querySelector("#route-time"),
  billableTime: document.querySelector("#billable-time"),
  ridePrice: document.querySelector("#ride-price"),
  tipPrice: document.querySelector("#tip-price"),
  totalPrice: document.querySelector("#total-price"),
  mapStatus: document.querySelector("#map-status"),
};

let map;
let directionsService;
let directionsRenderer;

bookingForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const request = buildBookingRequest();
  saveBookingRequest(request);
  bookingForm.querySelector(".form-note").textContent =
    "Ride request ready. Your email app will open so dispatch can confirm availability and complete payment.";
  window.location.href = buildBookingMailto(request);
});

bookingForm?.addEventListener("input", (event) => {
  if (event.target.name === "gratuity") {
    pricingState.tipPercent = Number(event.target.value || 0);
    updateEstimate();
  }
});

bookingForm?.addEventListener("change", (event) => {
  if (event.target.name === "gratuity") {
    pricingState.tipPercent = Number(event.target.value || 0);
    updateEstimate();
  }
});

function buildBookingRequest() {
  const formData = new FormData(bookingForm);
  const estimate = calculateEstimate();
  return {
    createdAt: new Date().toISOString(),
    tripType: formData.get("trip-type") || "",
    pickup: formData.get("pickup") || "",
    dropoff: formData.get("dropoff") || "",
    date: formData.get("date") || "",
    time: formData.get("time") || "",
    passengers: formData.get("passengers") || "",
    vehicle: formData.get("vehicle") || "",
    contact: formData.get("contact") || "",
    routeMinutes: pricingState.durationMinutes,
    distance: pricingState.distanceText,
    billableHours: estimate.billableHours,
    ridePrice: estimate.ridePrice,
    gratuityPercent: pricingState.tipPercent,
    gratuityAmount: estimate.tipAmount,
    totalDue: estimate.totalDue,
  };
}

function saveBookingRequest(request) {
  const key = "empireLimoQuoteRequests";
  const existing = JSON.parse(localStorage.getItem(key) || "[]");
  existing.unshift(request);
  localStorage.setItem(key, JSON.stringify(existing.slice(0, 25)));
}

function buildBookingMailto(request) {
  const to = config.email || "bookings@empireexecutivelimo.com";
  const subject = encodeURIComponent("Ride request - " + (request.date || "date TBD"));
  const body = encodeURIComponent([
    "New ride request",
    "",
    "Trip type: " + request.tripType,
    "Pickup: " + request.pickup,
    "Drop-off: " + request.dropoff,
    "Date: " + request.date,
    "Time: " + request.time,
    "Passengers: " + request.passengers,
    "Vehicle: " + request.vehicle,
    "Contact: " + request.contact,
    "Distance: " + (request.distance || "not calculated"),
    "Route time: " + (request.routeMinutes ? request.routeMinutes + " minutes" : "not calculated"),
    "Billable hours: " + request.billableHours,
    "Ride price: " + formatCurrency(request.ridePrice),
    "Gratuity: " + request.gratuityPercent + "% / " + formatCurrency(request.gratuityAmount),
    "Total due: " + formatCurrency(request.totalDue),
    "",
    "Source: " + (config.website || window.location.href),
  ].join("\n"));
  return "mailto:" + to + "?subject=" + subject + "&body=" + body;
}

function calculateEstimate() {
  const hourlyRate = Number(config.hourlyRate || 150);
  const minimumHours = Number(config.minimumHours || 1);
  const minutes = pricingState.durationMinutes || minimumHours * 60;
  const billableHours = Math.max(minimumHours, Math.ceil(minutes / 60));
  const ridePrice = billableHours * hourlyRate;
  const tipAmount = Math.round(ridePrice * pricingState.tipPercent) / 100;
  const totalDue = ridePrice + tipAmount;
  return { billableHours, ridePrice, tipAmount, totalDue };
}

function updateEstimate() {
  const estimate = calculateEstimate();
  if (estimateNodes.routeTime) {
    estimateNodes.routeTime.textContent = pricingState.durationMinutes
      ? formatDuration(pricingState.durationMinutes, pricingState.distanceText)
      : "Enter pickup and drop-off";
  }
  if (estimateNodes.billableTime) estimateNodes.billableTime.textContent = estimate.billableHours + (estimate.billableHours === 1 ? " hour" : " hours");
  if (estimateNodes.ridePrice) estimateNodes.ridePrice.textContent = formatCurrency(estimate.ridePrice);
  if (estimateNodes.tipPrice) estimateNodes.tipPrice.textContent = formatCurrency(estimate.tipAmount);
  if (estimateNodes.totalPrice) estimateNodes.totalPrice.textContent = formatCurrency(estimate.totalDue);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatDuration(minutes, distanceText) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const parts = [];
  if (hours) parts.push(hours + "h");
  parts.push(mins + "m");
  return parts.join(" ") + (distanceText ? " / " + distanceText : "");
}

function openPayment(url, fallbackMessage) {
  if (!url) {
    alert(fallbackMessage);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function currentCheckoutUrl() {
  return config.dynamicCheckoutUrl || config.stripeCheckoutUrl;
}

async function openCheckout() {
  if (!config.checkoutApiUrl) {
    openPayment(currentCheckoutUrl(), "Dynamic checkout is not connected yet.");
    return;
  }

  const request = buildBookingRequest();
  const response = await fetch(config.checkoutApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    alert("Checkout could not be created. Please call dispatch to complete payment.");
    return;
  }

  const data = await response.json();
  openPayment(data.url, "Checkout could not be opened.");
}

function configurePaymentButtons() {
  applePayButton?.addEventListener("click", () => {
    openCheckout();
  });

  cardPayButton?.addEventListener("click", () => {
    openCheckout();
  });
}

alternatePayments.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openCheckout();
  });
});

window.initEmpireLimoMap = function initEmpireLimoMap() {
  const mapElement = document.querySelector("#route-map");
  if (!mapElement || !window.google?.maps) return;

  map = new google.maps.Map(mapElement, {
    center: { lat: 34.0522, lng: -118.2437 },
    zoom: 10,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({ map });

  const pickupInput = document.querySelector("#pickup-input");
  const dropoffInput = document.querySelector("#dropoff-input");
  if (google.maps.places) {
    new google.maps.places.Autocomplete(pickupInput, { fields: ["formatted_address", "geometry", "name"] });
    new google.maps.places.Autocomplete(dropoffInput, { fields: ["formatted_address", "geometry", "name"] });
  }

  [pickupInput, dropoffInput].forEach((input) => {
    input?.addEventListener("change", calculateRoute);
    input?.addEventListener("blur", calculateRoute);
  });

  setMapStatus("Enter pickup and drop-off to calculate the route.");
};

function calculateRoute() {
  const pickup = document.querySelector("#pickup-input")?.value.trim();
  const dropoff = document.querySelector("#dropoff-input")?.value.trim();
  if (!directionsService || !pickup || !dropoff) return;

  setMapStatus("Calculating route...");
  directionsService.route(
    {
      origin: pickup,
      destination: dropoff,
      travelMode: google.maps.TravelMode.DRIVING,
      drivingOptions: {
        departureTime: new Date(),
        trafficModel: google.maps.TrafficModel.BEST_GUESS,
      },
    },
    (result, status) => {
      if (status !== "OK" || !result?.routes?.[0]?.legs?.[0]) {
        setMapStatus("Route could not be calculated. Check pickup and drop-off addresses.");
        return;
      }
      const leg = result.routes[0].legs[0];
      directionsRenderer.setDirections(result);
      pricingState.durationMinutes = Math.ceil((leg.duration_in_traffic?.value || leg.duration.value) / 60);
      pricingState.distanceText = leg.distance?.text || "";
      setMapStatus("Route calculated. Final availability is confirmed by dispatch.");
      updateEstimate();
    }
  );
}

function setMapStatus(message) {
  if (estimateNodes.mapStatus) estimateNodes.mapStatus.textContent = message;
}

function loadGoogleMaps() {
  const key = config.googleMapsApiKey;
  if (!key) {
    setMapStatus("Google Maps API key needed to activate live route calculation.");
    return;
  }
  const script = document.createElement("script");
  script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) + "&libraries=places&callback=initEmpireLimoMap";
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

updateEstimate();
configurePaymentButtons();
loadGoogleMaps();
