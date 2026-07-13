import { Router } from "../utils/Router";
import { ProbationOfficer } from "../services/ProbationOfficer.service";
import { GovernanceRules } from "../services/GovernanceRules.service";

const router = new Router();

router.get("/api/governance/rules", (req, res) => {
  try {
    const rules = GovernanceRules.getRules();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, rules }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.get("/api/governance/violations", (req, res) => {
  try {
    const violations = ProbationOfficer.getViolations();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, violations }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.get("/api/governance/decisions", (req, res) => {
  try {
    const decisions = ProbationOfficer.getDecisions();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, decisions }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.post("/api/governance/decision", async (req, res) => {
  try {
    let body = "";
    req.on("data", chunk => body += chunk.toString());
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (!payload.violationId || !payload.action || !payload.reason) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: "Missing 'violationId', 'action', or 'reason'" }));
          return;
        }

        const decision = ProbationOfficer.makeDecision(payload.violationId, payload.action, payload.reason);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, decision }));
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

router.post("/api/governance/resolve", async (req, res) => {
  try {
    let body = "";
    req.on("data", chunk => body += chunk.toString());
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (!payload.violationId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: "Missing 'violationId'" }));
          return;
        }

        const success = ProbationOfficer.resolveViolation(payload.violationId);
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

export default router;
