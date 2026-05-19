const bookingForm = document.querySelector(".booking-form");
const applePayButton = document.querySelector("#apple-pay-button");
const cardPayButton = document.querySelector("#card-pay-button");
const alternatePayments = document.querySelectorAll("[data-pay]");
const config = window.EMPIRE_LIMO_CONFIG || {};

const pricingState = {
  durationMinutes: null,
  distanceText: "",
  tipPercent: 0,
  hasRoute: false,
};

const estimateNodes = {
  routeTime: document.querySelector("#route-time"),
  billableTime: document.querySelector("#billable-time"),
  ridePrice: document.querySelector("#ride-price"),
  tipPrice: document.querySelector("#tip-price"),
  totalPrice: document.querySelector("#total-price"),
  paymentTotalLabel: document.querySelector("#payment-total-label"),
  mapStatus: document.querySelector("#map-status"),
};

let map;
let directionsService;
let directionsRenderer;
let suggestionTimer;
const selectedPlaces = {
  pickup: null,
  dropoff: null,
};

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
    return;
  }

  if (event.target.name === "pickup" || event.target.name === "dropoff") {
    selectedPlaces[event.target.name] = null;
    resetEstimate();
  }
});

bookingForm?.addEventListener("change", (event) => {
  if (event.target.name === "gratuity") {
    pricingState.tipPercent = Number(event.target.value || 0);
    updateEstimate();
    return;
  }

  if (event.target.name === "date" || event.target.name === "time") {
    if (pricingState.hasRoute) calculateRoute();
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
  if (!pricingState.hasRoute || !pricingState.durationMinutes) {
    return { billableHours: 0, ridePrice: 0, tipAmount: 0, totalDue: 0 };
  }
  const minutes = pricingState.durationMinutes;
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
  if (estimateNodes.paymentTotalLabel) estimateNodes.paymentTotalLabel.textContent = formatCurrency(estimate.totalDue);
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

function resetEstimate() {
  pricingState.durationMinutes = null;
  pricingState.distanceText = "";
  pricingState.hasRoute = false;
  updateEstimate();
  setMapStatus("Enter pickup and drop-off to calculate traffic-aware time and distance.");
}

function openPayment(url, fallbackMessage) {
  if (!url) {
    alert(fallbackMessage);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function currentCheckoutUrl() {
  return config.dynamicCheckoutUrl || config.checkoutApiUrl || "";
}

async function openCheckout() {
  if (!config.checkoutApiUrl) {
    alert("Full ride checkout is not live yet. Dispatch can confirm the calculated total and send the secure payment link.");
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
    const autocompleteOptions = {
      componentRestrictions: { country: "us" },
      fields: ["formatted_address", "geometry", "name", "place_id"],
    };
    const pickupAutocomplete = new google.maps.places.Autocomplete(pickupInput, autocompleteOptions);
    const dropoffAutocomplete = new google.maps.places.Autocomplete(dropoffInput, autocompleteOptions);
    pickupAutocomplete.addListener("place_changed", () => {
      selectedPlaces.pickup = normalizeSelectedPlace(pickupAutocomplete.getPlace(), pickupInput);
      calculateRoute();
    });
    dropoffAutocomplete.addListener("place_changed", () => {
      selectedPlaces.dropoff = normalizeSelectedPlace(dropoffAutocomplete.getPlace(), dropoffInput);
      calculateRoute();
    });
  }

  [pickupInput, dropoffInput].forEach((input) => {
    input?.addEventListener("change", calculateRoute);
    input?.addEventListener("blur", calculateRoute);
  });

  setMapStatus("Enter pickup and drop-off to calculate the route.");
};

function calculateRoute() {
  const pickupInput = document.querySelector("#pickup-input");
  const dropoffInput = document.querySelector("#dropoff-input");
  const pickup = pickupInput?.value.trim();
  const dropoff = dropoffInput?.value.trim();
  if (!directionsService || !pickup || !dropoff) return;

  setMapStatus("Calculating route...");
  directionsService.route(
    {
      origin: getRouteEndpoint("pickup", pickup),
      destination: getRouteEndpoint("dropoff", dropoff),
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.IMPERIAL,
      drivingOptions: {
        departureTime: getRequestedDepartureTime(),
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
      pricingState.hasRoute = true;
      setMapStatus(leg.duration_in_traffic ? "Traffic-aware Google route calculated. Final availability is confirmed by dispatch." : "Google route calculated. Final availability is confirmed by dispatch.");
      updateEstimate();
    }
  );
}

function normalizeSelectedPlace(place, input) {
  if (!place?.place_id) return null;
  const label = place.formatted_address || place.name || input.value.trim();
  if (label) input.value = label;
  return {
    inputValue: input.value.trim(),
    placeId: place.place_id,
    location: place.geometry?.location || null,
  };
}

function getRouteEndpoint(type, typedValue) {
  const place = selectedPlaces[type];
  if (place?.inputValue === typedValue) {
    if (place.placeId) return { placeId: place.placeId };
    if (place.location) return place.location;
  }
  return typedValue;
}

function getRequestedDepartureTime() {
  const formData = new FormData(bookingForm);
  const date = formData.get("date");
  const time = formData.get("time");
  const now = new Date();
  if (!date || !time) return now;

  const requested = new Date(date + "T" + time);
  if (Number.isNaN(requested.getTime()) || requested < now) return now;
  return requested;
}

function setMapStatus(message) {
  if (estimateNodes.mapStatus) estimateNodes.mapStatus.textContent = message;
}

function loadGoogleMaps() {
  const key = config.googleMapsApiKey;
  if (!key) {
    setMapStatus("Google Maps is not active yet. Route pricing stays at $0 until Google calculates the trip.");
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

function initFallbackRouteTools() {
  const pickupInput = document.querySelector("#pickup-input");
  const dropoffInput = document.querySelector("#dropoff-input");
  const pickupList = document.querySelector("#pickup-suggestions");
  const dropoffList = document.querySelector("#dropoff-suggestions");

  [pickupInput, dropoffInput].forEach((input) => {
    input?.addEventListener("input", () => {
      const list = input === pickupInput ? pickupList : dropoffList;
      queueAddressSuggestions(input.value, list);
    });
    input?.addEventListener("change", calculateFallbackRoute);
    input?.addEventListener("blur", calculateFallbackRoute);
  });

  setMapStatus("Enter pickup and drop-off to preview the route and calculate the estimated time.");
}

function queueAddressSuggestions(query, list) {
  window.clearTimeout(suggestionTimer);
  if (!query || query.trim().length < 4 || !list) return;
  suggestionTimer = window.setTimeout(() => {
    fetchAddressSuggestions(query, list);
  }, 350);
}

async function fetchAddressSuggestions(query, list) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=us&q=" + encodeURIComponent(query);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const results = await response.json();
    list.innerHTML = "";
    results.forEach((place) => {
      const option = document.createElement("option");
      option.value = place.display_name;
      option.dataset.lat = place.lat;
      option.dataset.lon = place.lon;
      list.appendChild(option);
    });
  } catch {
    // Suggestions are progressive enhancement only.
  }
}

async function calculateFallbackRoute() {
  const pickupInput = document.querySelector("#pickup-input");
  const dropoffInput = document.querySelector("#dropoff-input");
  const pickup = pickupInput?.value.trim();
  const dropoff = dropoffInput?.value.trim();
  if (!pickup || !dropoff) return;

  setMapStatus("Calculating route...");
  showGoogleDirectionsEmbed(pickup, dropoff);

  try {
    const [origin, destination] = await Promise.all([
      geocodeAddress(pickup),
      geocodeAddress(dropoff),
    ]);
    if (!origin || !destination) {
      setMapStatus("Could not find one of the addresses. Try a fuller address.");
      return;
    }

    const route = await fetchOsrmRoute(origin, destination);
    if (!route) {
      setMapStatus("Route could not be calculated. Try a more specific pickup and drop-off.");
      return;
    }

    pricingState.durationMinutes = null;
    pricingState.distanceText = metersToMiles(route.distance);
    pricingState.hasRoute = false;
    setMapStatus("Map preview loaded. Pricing waits for traffic-aware Google route calculation.");
    updateEstimate();
  } catch {
    setMapStatus("Route calculation is temporarily unavailable. Dispatch can confirm the price.");
  }
}

async function geocodeAddress(address) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" + encodeURIComponent(address);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const results = await response.json();
  if (!results[0]) return null;
  return {
    lat: Number(results[0].lat),
    lon: Number(results[0].lon),
  };
}

async function fetchOsrmRoute(origin, destination) {
  const coords = origin.lon + "," + origin.lat + ";" + destination.lon + "," + destination.lat;
  const url = "https://router.project-osrm.org/route/v1/driving/" + coords + "?overview=false";
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const data = await response.json();
  return data.routes?.[0] || null;
}

function showGoogleDirectionsEmbed(pickup, dropoff) {
  const mapElement = document.querySelector("#route-map");
  if (!mapElement) return;
  const src = "https://www.google.com/maps?output=embed&saddr=" + encodeURIComponent(pickup) + "&daddr=" + encodeURIComponent(dropoff);
  mapElement.innerHTML = '<iframe title="Google Maps route preview" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="' + src + '"></iframe>';
}

function metersToMiles(meters) {
  const miles = meters / 1609.344;
  return miles.toFixed(miles >= 10 ? 0 : 1) + " mi";
}
