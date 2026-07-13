import fs from "fs";
import path from "path";
import { Router } from "../utils/Router";
import { PrimeDiscovery } from "../services/PrimeDiscovery.service";
import { SupabaseSync } from "../services/SupabaseSync.service";
import { LocalSynthesizer } from "../services/LocalSynthesizer.service";
import { AiProviderManager } from "../services/AiProviderManager.service";

const router = new Router();

router.get("/api/prime/status", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const db = PrimeDiscovery.getDatabase();
  let componentsCount = 0;
  let candidatesCount = 0;

  if (db) {
    try {
      const counts = db.prepare(`
        SELECT classification, COUNT(*) as count 
        FROM prime_classifications 
        GROUP BY classification
      `).all() as any[];

      for (const row of counts) {
        if (row.classification === "recognized_component") componentsCount = row.count;
        if (row.classification === "innovation_candidate") candidatesCount = row.count;
      }
    } catch(e) {}
  }

  res.end(JSON.stringify({ 
    ok: true, 
    syncStatus: SupabaseSync.getSyncStatus(),
    componentsCount,
    candidatesCount
  }));
});

router.get("/api/prime/components", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const db = PrimeDiscovery.getDatabase();
  if (!db) return res.end(JSON.stringify({ ok: false, error: "DB not initialized" }));
  
  const components = db.prepare(`
    SELECT a.*, c.classification, c.confidence, c.reasoning 
    FROM prime_artifacts a 
    JOIN prime_classifications c ON a.id = c.artifact_id
    WHERE c.classification = 'recognized_component'
  `).all();
  
  res.end(JSON.stringify({ ok: true, components }));
});

router.get("/api/prime/candidates", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const db = PrimeDiscovery.getDatabase();
  if (!db) return res.end(JSON.stringify({ ok: false, error: "DB not initialized" }));
  
  const candidates = db.prepare(`
    SELECT a.*, c.classification, c.confidence, c.reasoning 
    FROM prime_artifacts a 
    JOIN prime_classifications c ON a.id = c.artifact_id
    WHERE c.classification = 'innovation_candidate'
  `).all();
  
  res.end(JSON.stringify({ ok: true, candidates }));
});

router.post("/api/prime/scan", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  req.on('end', () => {
    let targetPath = process.cwd();
    try {
      if (body) {
        const payload = JSON.parse(body);
        if (payload.path) targetPath = payload.path;
      }
    } catch(e) {}
    
    PrimeDiscovery.scanWorkspace(targetPath);
    res.end(JSON.stringify({ ok: true, message: "Scan triggered", targetPath }));
  });
});

router.get("/api/prime/download-report", (req, res) => {
  const exportPath = path.resolve(process.cwd(), "server", "data", "prime_export.json");
  if (fs.existsSync(exportPath)) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="prime_export.json"');
    const stream = fs.createReadStream(exportPath);
    stream.pipe(res as any);
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: "Report not found" }));
  }
});

router.post("/api/prime/synthesize", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body || "{}");
      if (!payload.artifactId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok: false, error: "Missing artifactId" }));
      }
      
      const result = await LocalSynthesizer.synthesize(payload.artifactId);
      res.end(JSON.stringify({ ok: true, result }));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
});

router.get("/api/prime/innovation-candidates", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const db = PrimeDiscovery.getDatabase();
  if (!db) return res.end(JSON.stringify([]));

  const candidates = db.prepare(`SELECT * FROM innovation_candidates ORDER BY id DESC`).all();
  res.end(JSON.stringify(candidates));
});

router.post("/api/prime/run-pipeline", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  LocalSynthesizer.autoRun();
  res.end(JSON.stringify({ ok: true, message: "Pipeline started" }));
});

router.get("/api/prime/ai-status", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const statuses = await AiProviderManager.getProvidersStatus();
    res.end(JSON.stringify({ ok: true, providers: statuses }));
  } catch (err: any) {
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.post("/api/prime/ai-config", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    try {
      const payload = JSON.parse(body || "{}");
      if (payload.key && payload.value !== undefined) {
        PrimeDiscovery.setSetting(payload.key, payload.value);
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: "Invalid payload" }));
      }
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
});

router.post("/api/prime/refine", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body || "{}");
      if (!payload.candidateId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok: false, error: "Missing candidateId" }));
      }

      const { Orchestrator } = await import("../services/Orchestrator.service.js");
      const { PrimeDiscovery } = await import("../services/PrimeDiscovery.service.js");

      const sdoaDb = PrimeDiscovery.getDatabase();
      if (!sdoaDb) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ ok: false, error: "DB not initialized" }));
      }

      const candidate = sdoaDb.prepare(`SELECT * FROM innovation_candidates WHERE id = ?`).get(payload.candidateId) as any;
      if (!candidate) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ ok: false, error: "Candidate not found" }));
      }

      const prompt = `Refine SDOA candidate ${candidate.source_file}`;
      const rawRefinement = await Orchestrator.generateRefinement(prompt, candidate.pattern_type);

      let refinement: any = {};
      try {
        refinement = JSON.parse(rawRefinement);
      } catch (e) {
        refinement = {
          refinedName: "RefinedCandidate",
          layer: 2,
          operationalRole: "savant",
          capabilities: ["sdoa:refined:fallback"],
          docs: rawRefinement
        };
      }

      // Record refinement back to prime database
      sdoaDb.prepare(`
        UPDATE innovation_candidates 
        SET status = 'refined',
            reasoning = ?
        WHERE id = ?
      `).run(`Cloud Refined: ${refinement.docs || 'Refinement complete.'}`, payload.candidateId);

      res.end(JSON.stringify({ ok: true, refinement }));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
});

export default router;
