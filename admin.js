const API_BASE = "https://empire-limo-checkout.golyalaszlo93.workers.dev";
const BOOKINGS_API = API_BASE + "/bookings";
const LEADS_API = API_BASE + "/leads";
const tokenInput = document.querySelector("#admin-token");
const loadButton = document.querySelector("#load-bookings");
const refreshButton = document.querySelector("#refresh-bookings");
const searchInput = document.querySelector("#booking-search");
const showTestsInput = document.querySelector("#show-tests");
const tabButtons = document.querySelectorAll("[data-view]");
const list = document.querySelector("#booking-list");
const note = document.querySelector("#admin-note");

let allBookings = [];
let allLeads = [];
let activeView = "bookings";

const savedToken = sessionStorage.getItem("empireAdminToken");
if (savedToken) tokenInput.value = savedToken;

loadButton.addEventListener("click", loadAdminData);
refreshButton.addEventListener("click", loadAdminData);
searchInput.addEventListener("input", applyFilters);
showTestsInput.addEventListener("change", applyFilters);
tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeView = button.dataset.view;
    tabButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    applyFilters();
  });
});

list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  const source = button.dataset.type === "lead" ? allLeads : allBookings;
  const item = source.find((entry) => (entry.sessionId || entry.id) === button.dataset.copy);
  if (!item) return;
  await navigator.clipboard.writeText(button.dataset.type === "lead" ? formatLeadDetails(item) : formatDispatchDetails(item));
  button.textContent = "Copied";
  window.setTimeout(() => { button.textContent = button.dataset.type === "lead" ? "Copy lead details" : "Copy dispatch details"; }, 1400);
});

async function loadAdminData() {
  const token = tokenInput.value.trim();
  if (!token) {
    note.textContent = "Enter the admin token first.";
    return;
  }

  sessionStorage.setItem("empireAdminToken", token);
  note.textContent = "Loading admin data...";
  list.innerHTML = "";

  try {
    const [bookingsResponse, leadsResponse] = await Promise.all([
      fetch(BOOKINGS_API, { headers: { Authorization: "Bearer " + token } }),
      fetch(LEADS_API, { headers: { Authorization: "Bearer " + token } }),
    ]);
    if (!bookingsResponse.ok || !leadsResponse.ok) {
      throw new Error(bookingsResponse.status === 401 || leadsResponse.status === 401 ? "Unauthorized" : "Could not load admin data");
    }
    const bookingsData = await bookingsResponse.json();
    const leadsData = await leadsResponse.json();
    allBookings = bookingsData.bookings || [];
    allLeads = leadsData.leads || [];
    applyFilters();
  } catch (error) {
    note.textContent = error.message;
  }
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const showTests = showTestsInput.checked;
  const source = activeView === "leads" ? allLeads : allBookings;
  const items = source.filter((item) => {
    if (!showTests && item.isTest) return false;
    if (!query) return true;
    return searchableText(item).includes(query);
  });
  activeView === "leads" ? renderLeads(items) : renderBookings(items);
}

function searchableText(item) {
  return [
    item.date,
    item.time,
    item.customerName,
    item.customerEmail,
    item.name,
    item.contact,
    item.pickup,
    item.dropoff,
    item.vehiclePlan,
    item.tripType,
    item.message,
    item.total,
  ].join(" ").toLowerCase();
}

function renderBookings(bookings) {
  note.textContent = bookings.length ? bookings.length + " paid booking" + (bookings.length === 1 ? "" : "s") : "No matching paid bookings.";
  list.innerHTML = bookings.map(renderBooking).join("");
}

function renderLeads(leads) {
  note.textContent = leads.length ? leads.length + " open lead" + (leads.length === 1 ? "" : "s") : "No matching open leads.";
  list.innerHTML = leads.map(renderLead).join("");
}

function renderBooking(booking) {
  return [
    '<article class="booking-card">',
    "<header>",
    "<h2>" + escapeHtml(booking.date || "Date TBD") + " " + escapeHtml(booking.time || "") + "<br>" + escapeHtml(booking.customerName || booking.customerEmail || "Customer") + (booking.isTest ? " <small>(test)</small>" : "") + "</h2>",
    "<strong>" + escapeHtml(booking.total || "") + "</strong>",
    "</header>",
    '<div class="booking-grid">',
    bookingField("Pickup", booking.pickup || "n/a"),
    bookingField("Drop-off", booking.dropoff || "n/a"),
    bookingField("Vehicle", booking.vehiclePlan || booking.vehicle || "n/a"),
    bookingField("Contact", booking.contact || booking.customerEmail || "n/a"),
    bookingField("Billable", String(booking.billableHours || "n/a") + " hour(s), gratuity " + String(booking.gratuityPercent || "0") + "%"),
    bookingField("Paid", booking.paidAt || "n/a"),
    "</div>",
    '<div class="booking-actions"><button class="button ghost" type="button" data-type="booking" data-copy="' + escapeHtml(booking.sessionId || "") + '">Copy dispatch details</button></div>',
    "</article>",
  ].join("");
}

function renderLead(lead) {
  return [
    '<article class="booking-card">',
    "<header>",
    "<h2>" + escapeHtml(lead.date || "Date TBD") + " " + escapeHtml(lead.time || "") + "<br>" + escapeHtml(lead.name || lead.contact || "Lead") + (lead.isTest ? " <small>(test)</small>" : "") + "</h2>",
    "<strong>Open</strong>",
    "</header>",
    '<div class="booking-grid">',
    bookingField("Trip", lead.tripType || "n/a"),
    bookingField("Pickup", lead.pickup || "n/a"),
    bookingField("Drop-off", lead.dropoff || "n/a"),
    bookingField("Contact", lead.contact || "n/a"),
    bookingField("Passengers", lead.passengers || "n/a"),
    bookingField("Received", lead.createdAt || "n/a"),
    "</div>",
    lead.message ? '<p class="form-note">' + escapeHtml(lead.message) + "</p>" : "",
    '<div class="booking-actions"><button class="button ghost" type="button" data-type="lead" data-copy="' + escapeHtml(lead.id || "") + '">Copy lead details</button></div>',
    "</article>",
  ].join("");
}

function bookingField(label, value) {
  return "<div>" + escapeHtml(label) + "<span>" + escapeHtml(value) + "</span></div>";
}

function formatDispatchDetails(booking) {
  return [
    "Empire Executive Limo paid booking",
    "Total: " + (booking.total || "n/a"),
    "Customer: " + (booking.customerName || "n/a"),
    "Contact: " + (booking.contact || booking.customerEmail || "n/a"),
    "Date/time: " + (booking.date || "n/a") + " " + (booking.time || ""),
    "Pickup: " + (booking.pickup || "n/a"),
    "Drop-off: " + (booking.dropoff || "n/a"),
    "Vehicle: " + (booking.vehiclePlan || booking.vehicle || "n/a"),
    "Billable: " + (booking.billableHours || "n/a") + " hour(s)",
    "Gratuity: " + (booking.gratuityPercent || "0") + "%",
    "Stripe session: " + (booking.sessionId || "n/a"),
  ].join("\n");
}

function formatLeadDetails(lead) {
  return [
    "Empire Executive Limo open lead",
    "Name: " + (lead.name || "n/a"),
    "Contact: " + (lead.contact || "n/a"),
    "Trip type: " + (lead.tripType || "n/a"),
    "Date/time: " + (lead.date || "n/a") + " " + (lead.time || ""),
    "Pickup: " + (lead.pickup || "n/a"),
    "Drop-off: " + (lead.dropoff || "n/a"),
    "Passengers: " + (lead.passengers || "n/a"),
    "Message: " + (lead.message || "n/a"),
    "Lead ID: " + (lead.id || "n/a"),
  ].join("\n");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}
