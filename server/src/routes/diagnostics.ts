import { Router } from "../utils/Router";
import { DiagnosticRunner } from "../services/DiagnosticRunner.service";

const router = new Router();

router.use("/api/diagnostics/run", async (req, res) => {
  if (req.method === "GET") {
    try {
      const results = await DiagnosticRunner.runAllDiagnostics();
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true, results }));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  } else {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
  }
});

export default router;
