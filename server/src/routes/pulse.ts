import { Router } from "../utils/Router";
import { Pulse } from "../services/Pulse.service";

const router = new Router();

router.get("/api/pulse/snapshot", async (req, res) => {
  try {
    // If we want to flush and create a new snapshot on demand:
    // const { snapshot } = await Pulse.run({ flush: false });
    // But usually we just return the latest stored snapshot:
    const snapshot = Pulse.getSnapshot();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, snapshot }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.post("/api/pulse/snapshot", async (req, res) => {
  try {
    // Trigger a manual run
    const { snapshot } = await Pulse.run({ flush: false });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, snapshot }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.get("/api/pulse/profiles", (req, res) => {
  try {
    // Extract moduleId from URL query if needed, or return all modules
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const moduleId = url.searchParams.get("moduleId");
    
    if (moduleId) {
      const profile = Pulse.getModuleProfile({ moduleId });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, profile }));
    } else {
      // getTopByLatency essentially returns all if n is large enough
      const { modules } = Pulse.getTopByLatency({ n: 1000, percentileTarget: 95 });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, profiles: modules }));
    }
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.get("/api/pulse/rankings", (req, res) => {
  try {
    const latencyRankings = Pulse.getTopByLatency({ n: 10, percentileTarget: 95 });
    const errorRankings = Pulse.getTopByErrorRate({ n: 10, threshold: 0 });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, latency: latencyRankings, errors: errorRankings }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

export default router;
