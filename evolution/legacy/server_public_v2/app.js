
const MANIFEST = {
  id: "app.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "fetch",
    "document"
  ],
  dependencies: [],
  docs: "Polls the status API every 5 seconds"
};

// Poll the status API every 5 seconds
async function pollStatus() {
  try {
    const res = await fetch("/dashboard/api/status");
    const data = await res.json();

    // Update uptime
    const uptimeEl = document.querySelector("[data-uptime]");
    if (uptimeEl) uptimeEl.textContent = data.uptime;

    // Update proposal counts
    const queued = document.querySelector("[data-proposals-queued]");
    if (queued) queued.textContent = data.proposals.queued;

    const accepted = document.querySelector("[data-proposals-accepted]");
    if (accepted) accepted.textContent = data.proposals.accepted;

    const rejected = document.querySelector("[data-proposals-rejected]");
    if (rejected) rejected.textContent = data.proposals.rejected;

  } catch (err) {
    console.error("Dashboard polling error:", err);
  }
}

setInterval(pollStatus, 5000);
pollStatus();
