import { Router } from "../utils/Router";
import { AssemblyLine } from "../services/AssemblyLine.service";

const router = new Router();

router.get("/api/assembly/processes", (req, res) => {
  try {
    const processes = AssemblyLine.getProcesses();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, processes }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.get("/api/assembly/logs", (req, res) => {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const id = url.searchParams.get("id");
    
    if (!id) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: "Missing process 'id' parameter" }));
      return;
    }

    const log = AssemblyLine.getProcessLog(id);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, log }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.post("/api/assembly/fabricate", async (req, res) => {
  try {
    let body = "";
    req.on("data", chunk => body += chunk.toString());
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (!payload.moduleId || !payload.sourceData) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: "Missing 'moduleId' or 'sourceData'" }));
          return;
        }

        // Trigger manual fabrication
        const result = await AssemblyLine.fabricateSleeve(payload.moduleId, payload.sourceData);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON format" }));
      }
    });
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

export default router;
