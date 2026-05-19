const BOOKINGS_API = "https://empire-limo-checkout.golyalaszlo93.workers.dev/bookings";
const tokenInput = document.querySelector("#admin-token");
const loadButton = document.querySelector("#load-bookings");
const refreshButton = document.querySelector("#refresh-bookings");
const list = document.querySelector("#booking-list");
const note = document.querySelector("#admin-note");

const savedToken = sessionStorage.getItem("empireAdminToken");
if (savedToken) tokenInput.value = savedToken;

loadButton.addEventListener("click", loadBookings);
refreshButton.addEventListener("click", loadBookings);

async function loadBookings() {
  const token = tokenInput.value.trim();
  if (!token) {
    note.textContent = "Enter the admin token first.";
    return;
  }

  sessionStorage.setItem("empireAdminToken", token);
  note.textContent = "Loading bookings...";
  list.innerHTML = "";

  try {
    const response = await fetch(BOOKINGS_API, {
      headers: { Authorization: "Bearer " + token },
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Unauthorized" : "Could not load bookings");
    const data = await response.json();
    renderBookings(data.bookings || []);
  } catch (error) {
    note.textContent = error.message;
  }
}

function renderBookings(bookings) {
  note.textContent = bookings.length ? bookings.length + " paid booking" + (bookings.length === 1 ? "" : "s") : "No paid bookings yet.";
  list.innerHTML = bookings.map(renderBooking).join("");
}

function renderBooking(booking) {
  return [
    '<article class="booking-card">',
    "<header>",
    "<h2>" + escapeHtml(booking.date || "Date TBD") + " " + escapeHtml(booking.time || "") + "<br>" + escapeHtml(booking.customerName || booking.customerEmail || "Customer") + "</h2>",
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
    "</article>",
  ].join("");
}

function bookingField(label, value) {
  return "<div>" + escapeHtml(label) + "<span>" + escapeHtml(value) + "</span></div>";
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
