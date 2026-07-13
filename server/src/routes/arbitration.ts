import { Router } from "../utils/Router";
import { TransportArbitration } from "../services/TransportArbitration.service";

const router = new Router();

router.get("/api/arbitration/routes", (req, res) => {
  try {
    const routes = TransportArbitration.getRoutingTable();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, routes }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.post("/api/arbitration/override", async (req, res) => {
  try {
    let body = "";
    req.on("data", chunk => body += chunk.toString());
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (!payload.moduleId || !payload.sleeveId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: "Missing 'moduleId' or 'sleeveId'" }));
          return;
        }

        const route = TransportArbitration.overrideRoute(payload.moduleId, payload.sleeveId);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, route }));
      } catch (err: any) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.post("/api/arbitration/simulate-crash", async (req, res) => {
  try {
    let body = "";
    req.on("data", chunk => body += chunk.toString());
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (!payload.moduleId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: "Missing 'moduleId'" }));
          return;
        }

        // Import emit dynamically to avoid circular dependencies if any
        const { emit } = require("../engine/events");
        emit("pulse:anomalyDetected", {
          moduleId: payload.moduleId,
          severity: "high",
          metric: "latency_zscore_simulated",
          value: 4.5,
          threshold: 2.0
        });

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, message: "Crash simulated" }));
      } catch (err: any) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

export default router;
