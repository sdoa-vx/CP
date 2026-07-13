import { Router } from "../utils/Router";
import { Chronicle } from "../services/Chronicle.service";

const router = new Router();

router.get("/api/chronicle", (req, res) => {
  try {
    const chain = Chronicle.replay();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, chain }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.get("/api/chronicle/verify", (req, res) => {
  try {
    const valid = Chronicle.verify();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, valid }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

export default router;
