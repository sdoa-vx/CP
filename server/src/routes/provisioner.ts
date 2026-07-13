import { Router } from "../utils/Router";
import { Provisioner } from "../services/Provisioner.service";

const router = new Router();

router.get("/api/provisioner/registry", (req, res) => {
  try {
    const registry = Provisioner.getRegistry();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, registry }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.get("/api/provisioner/versions", (req, res) => {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const moduleId = url.searchParams.get("moduleId");
    
    if (!moduleId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: "Missing 'moduleId' parameter" }));
      return;
    }

    const versions = Provisioner.getSleeveVersions(moduleId);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, moduleId, versions }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

export default router;
