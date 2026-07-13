import { Router } from "../utils/Router";
import { LifecycleManager } from "../services/LifecycleManager.service";

const router = new Router();

router.get("/api/lifecycle/status", (req, res) => {
  try {
    const states = LifecycleManager.getStates();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, states }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.post("/api/lifecycle/activate", async (req, res) => {
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

        const state = LifecycleManager.activateSleeve(payload.moduleId, payload.versionId);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, state }));
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

router.post("/api/lifecycle/deactivate", async (req, res) => {
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

        const success = LifecycleManager.deactivateSleeve(payload.moduleId);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, success }));
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

router.post("/api/lifecycle/rollback", async (req, res) => {
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

        const state = LifecycleManager.rollbackSleeve(payload.moduleId);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, state }));
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
