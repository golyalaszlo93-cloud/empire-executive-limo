const config = window.EMPIRE_LIMO_CONFIG || {};
const summary = document.querySelector("#booking-summary");

async function loadBookingSummary() {
  const sessionId = new URLSearchParams(window.location.search).get("session_id");
  if (!sessionId || !config.bookingStatusUrl || !summary) {
    summary.innerHTML = "<h2>Next step</h2><p>Dispatch has the payment handoff. If anything changes, call 323-470-1958.</p>";
    return;
  }

  try {
    const response = await fetch(config.bookingStatusUrl + "?session_id=" + encodeURIComponent(sessionId));
    if (!response.ok) throw new Error("not ready");
    const data = await response.json();
    const booking = data.booking || {};
    const meta = booking.metadata || {};
    summary.innerHTML = [
      "<h2>Ride details</h2>",
      "<p>Total paid: " + escapeHtml(formatMoney(booking.amountTotal, booking.currency)) + "</p>",
      "<p>Pickup: " + escapeHtml(meta.pickup || "dispatch will confirm") + "</p>",
      "<p>Drop-off: " + escapeHtml(meta.dropoff || "dispatch will confirm") + "</p>",
      "<p>Date/time: " + escapeHtml((meta.date || "TBD") + " " + (meta.time || "")) + "</p>",
      "<p>Vehicle: " + escapeHtml(meta.vehicle_plan || meta.vehicle || "dispatch will confirm") + "</p>",
    ].join("");
  } catch {
    summary.innerHTML = "<h2>Processing</h2><p>Stripe confirmed the return. The booking record may take a moment to update. Dispatch will follow up shortly.</p>";
  }
}

function formatMoney(cents, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency || "usd").toUpperCase() }).format(Number(cents || 0) / 100);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

loadBookingSummary();
