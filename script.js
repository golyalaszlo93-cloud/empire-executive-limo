const bookingForm = document.querySelector(".booking-form");
const applePayButton = document.querySelector("#apple-pay-button");
const cardPayButton = document.querySelector("#card-pay-button");
const alternatePayments = document.querySelectorAll("[data-pay]");
const config = window.EMPIRE_LIMO_CONFIG || {};
const BASE_ADDRESS = "1231 N Las Palmas Ave, Los Angeles, CA 90038";
const VEHICLE_CAPACITY = {
  "Luxury Sedan": 3,
  "Luxury SUV": 6,
  "Party Bus": 12,
  "Executive Bus": 12,
};

const pricingState = {
  durationMinutes: null,
  distanceText: "",
  tipPercent: 0,
  hasRoute: false,
};

const estimateNodes = {
  routeTime: document.querySelector("#route-time"),
  billableTime: document.querySelector("#billable-time"),
  vehiclePlan: document.querySelector("#vehicle-plan"),
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
  openCheckout();
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
    return;
  }

  if (["service-hours", "vehicle-count", "passengers"].includes(event.target.name)) {
    updateEstimate();
  }
});

bookingForm?.addEventListener("change", (event) => {
  if (event.target.name === "gratuity") {
    pricingState.tipPercent = Number(event.target.value || 0);
    updateEstimate();
    return;
  }

  if (event.target.name === "trip-type") {
    updateServiceMode();
    calculateRoute();
    return;
  }

  if (event.target.name === "date" || event.target.name === "time" || event.target.name === "vehicle" || event.target.name === "passengers" || event.target.name === "vehicle-count" || event.target.name === "service-hours") {
    updateEstimate();
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
    vehicleCount: estimate.vehicleCount,
    vehiclePlan: estimate.vehiclePlan,
    serviceHours: formData.get("service-hours") || "",
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
    "Vehicle quantity: " + request.vehicleCount,
    "Vehicle plan: " + request.vehiclePlan,
    "Service hours: " + (request.serviceHours || "route based"),
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
  const formData = new FormData(bookingForm);
  const serviceMode = getServiceMode(formData);
  const selectedVehicleCount = getVehicleCount(formData);
  const vehicleCount = getBillableVehicleCount(formData, selectedVehicleCount);
  const vehiclePlan = buildVehiclePlan(formData, selectedVehicleCount, vehicleCount);
  if (serviceMode === "hourly") {
    const hours = Math.max(0, Number(formData.get("service-hours") || 0));
    if (!hours || !vehicleCount) return emptyEstimate(vehicleCount, vehiclePlan);
    const billableHours = Math.ceil(hours);
    const ridePrice = billableHours * hourlyRate * vehicleCount;
    const tipAmount = Math.round(ridePrice * pricingState.tipPercent) / 100;
    return { billableHours, ridePrice, tipAmount, totalDue: ridePrice + tipAmount, vehicleCount, vehiclePlan };
  }
  if (!pricingState.hasRoute || !pricingState.durationMinutes) {
    return emptyEstimate(vehicleCount, vehiclePlan);
  }
  const minutes = pricingState.durationMinutes;
  const billableHours = Math.max(minimumHours, Math.ceil(minutes / 60));
  const ridePrice = billableHours * hourlyRate * vehicleCount;
  const tipAmount = Math.round(ridePrice * pricingState.tipPercent) / 100;
  const totalDue = ridePrice + tipAmount;
  return { billableHours, ridePrice, tipAmount, totalDue, vehicleCount, vehiclePlan };
}

function emptyEstimate(vehicleCount, vehiclePlan) {
  return { billableHours: 0, ridePrice: 0, tipAmount: 0, totalDue: 0, vehicleCount, vehiclePlan };
}

function updateEstimate() {
  const estimate = calculateEstimate();
  if (estimateNodes.routeTime) {
    estimateNodes.routeTime.textContent = getServiceMode() === "hourly"
      ? "Hourly reservation"
      : pricingState.durationMinutes
        ? formatDuration(pricingState.durationMinutes, pricingState.distanceText)
        : "Enter pickup and drop-off";
  }
  if (estimateNodes.billableTime) estimateNodes.billableTime.textContent = estimate.billableHours + (estimate.billableHours === 1 ? " hour" : " hours");
  if (estimateNodes.vehiclePlan) estimateNodes.vehiclePlan.textContent = estimate.vehiclePlan;
  if (estimateNodes.ridePrice) estimateNodes.ridePrice.textContent = formatCurrency(estimate.ridePrice);
  if (estimateNodes.tipPrice) estimateNodes.tipPrice.textContent = formatCurrency(estimate.tipAmount);
  if (estimateNodes.totalPrice) estimateNodes.totalPrice.textContent = formatCurrency(estimate.totalDue);
  if (estimateNodes.paymentTotalLabel) estimateNodes.paymentTotalLabel.textContent = formatCurrency(estimate.totalDue);
}

function getServiceMode(formData = new FormData(bookingForm)) {
  return String(formData.get("trip-type") || "").toLowerCase().includes("hourly") ? "hourly" : "route";
}

function getVehicleCount(formData = new FormData(bookingForm)) {
  return Math.max(1, Math.ceil(Number(formData.get("vehicle-count") || 1)));
}

function getBillableVehicleCount(formData = new FormData(bookingForm), selectedVehicleCount = getVehicleCount(formData)) {
  const vehicle = String(formData.get("vehicle") || "Luxury SUV");
  const passengers = Math.max(1, Math.ceil(Number(formData.get("passengers") || 1)));
  if (vehicle === "Not sure yet") {
    if (passengers <= 6) return Math.max(1, selectedVehicleCount);
    return Math.max(Math.ceil(passengers / 12), selectedVehicleCount);
  }

  const capacity = VEHICLE_CAPACITY[vehicle] || 1;
  return Math.max(Math.ceil(passengers / capacity), selectedVehicleCount);
}

function buildVehiclePlan(formData = new FormData(bookingForm), selectedVehicleCount = getVehicleCount(formData), billableVehicleCount = getBillableVehicleCount(formData, selectedVehicleCount)) {
  const vehicle = String(formData.get("vehicle") || "Luxury SUV");
  const passengers = Math.max(1, Math.ceil(Number(formData.get("passengers") || 1)));
  if (vehicle === "Not sure yet") {
    if (passengers <= 3) return billableVehicleCount + " Luxury Sedan" + (billableVehicleCount === 1 ? "" : "s");
    if (passengers <= 6) return billableVehicleCount + " Luxury SUV" + (billableVehicleCount === 1 ? "" : "s");
    return billableVehicleCount + " Party Bus / Executive Bus";
  }

  const label = billableVehicleCount + " " + vehicle + (billableVehicleCount === 1 ? "" : "s");
  return billableVehicleCount === selectedVehicleCount ? label : label + " for " + passengers + " passengers";
}

function updateServiceMode() {
  const isHourly = getServiceMode() === "hourly";
  document.querySelector(".service-options")?.classList.toggle("is-hidden", !isHourly);
  if (isHourly) {
    setMapStatus("Hourly chauffeur service is billed at $150 per hour per vehicle.");
  } else {
    setMapStatus("Point-to-point pricing includes driver travel from Hollywood base to pickup.");
  }
  updateEstimate();
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
  if (!request.totalDue || request.totalDue < 150) {
    alert("Enter the trip details first so the website can calculate the ride total.");
    return;
  }

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

function handlePaymentReturn() {
  if (!bookingForm) return;
  const params = new URLSearchParams(window.location.search);
  const status = params.get("payment");
  const note = bookingForm.querySelector(".form-note");
  if (!status || !note) return;

  if (status === "success") {
    note.textContent = "Payment received. Your ride request is logged. Dispatch will confirm vehicle availability and final ride details shortly.";
  }

  if (status === "cancelled") {
    note.textContent = "Payment was cancelled. Your ride details are still here so you can review and try checkout again.";
  }
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

async function calculateRoute() {
  const pickupInput = document.querySelector("#pickup-input");
  const dropoffInput = document.querySelector("#dropoff-input");
  const pickup = pickupInput?.value.trim();
  const dropoff = dropoffInput?.value.trim();
  if (getServiceMode() === "hourly") {
    updateEstimate();
    return;
  }
  if (!directionsService || !pickup || !dropoff) return;

  setMapStatus("Calculating route...");
  const pickupEndpoint = getRouteEndpoint("pickup", pickup);
  const dropoffEndpoint = getRouteEndpoint("dropoff", dropoff);
  const routeOptions = {
    travelMode: google.maps.TravelMode.DRIVING,
    unitSystem: google.maps.UnitSystem.IMPERIAL,
    drivingOptions: {
      departureTime: getRequestedDepartureTime(),
      trafficModel: google.maps.TrafficModel.BEST_GUESS,
    },
  };

  try {
    const [baseToPickup, pickupToDropoff, displayRoute] = await Promise.all([
      getDirections({ origin: BASE_ADDRESS, destination: pickupEndpoint, ...routeOptions }),
      getDirections({ origin: pickupEndpoint, destination: dropoffEndpoint, ...routeOptions }),
      getDirections({
        origin: BASE_ADDRESS,
        destination: dropoffEndpoint,
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.IMPERIAL,
        waypoints: [{ location: pickupEndpoint, stopover: true }],
      }),
    ]);

    const trafficLegs = [
      baseToPickup.routes?.[0]?.legs?.[0],
      pickupToDropoff.routes?.[0]?.legs?.[0],
    ].filter(Boolean);
    if (trafficLegs.length !== 2) throw new Error("Missing route leg");

    directionsRenderer.setDirections(displayRoute);
    const seconds = trafficLegs.reduce((sum, leg) => sum + (leg.duration_in_traffic?.value || leg.duration?.value || 0), 0);
    const meters = trafficLegs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
    const hasTraffic = trafficLegs.some((leg) => leg.duration_in_traffic);
    pricingState.durationMinutes = Math.ceil(seconds / 60);
    pricingState.distanceText = metersToMiles(meters);
    pricingState.hasRoute = true;
    setMapStatus(hasTraffic ? "Traffic-aware route includes Hollywood base to pickup, then pickup to drop-off." : "Route includes Hollywood base to pickup, then pickup to drop-off.");
    updateEstimate();
  } catch {
    pricingState.hasRoute = false;
    pricingState.durationMinutes = null;
    pricingState.distanceText = "";
    updateEstimate();
    setMapStatus("Route could not be calculated. Check pickup and drop-off addresses.");
  }
}

function getDirections(request) {
  return new Promise((resolve, reject) => {
    directionsService.route(request, (result, status) => {
      if (status !== "OK" || !result?.routes?.[0]?.legs?.[0]) {
        reject(new Error(status || "ROUTE_FAILED"));
        return;
      }
      resolve(result);
    });
  });
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
updateServiceMode();
handlePaymentReturn();

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
