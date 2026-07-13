import { Router } from "../utils/Router";
import { TimeMachine } from "../services/TimeMachine.service";
import { AiProviderManager } from "../services/AiProviderManager.service";

const router = new Router();

router.get("/api/timemachine/events", (req, res) => {
  try {
    const events = TimeMachine.getTimeline();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, events }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.get("/api/timemachine/replay", (req, res) => {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const at = url.searchParams.get("at");
    
    if (!at) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: "Missing 'at' parameter (timestamp)" }));
      return;
    }

    const state = TimeMachine.replayAt(at);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, state }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

router.post("/api/timemachine/visualize", async (req, res) => {
  try {
    let body = "";
    req.on("data", chunk => body += chunk.toString());
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const events = payload.events;

        if (!events || !Array.isArray(events)) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ ok: false, error: "Invalid events payload" }));
        }

        const prompt = `
You are an expert Data Visualization Engineer.
Given the following JSON array of software mesh events, write a self-contained JavaScript function named \`render(containerId, events, d3)\` that renders a highly creative, beautiful, cinematic timeline visualization using D3.js. 

Requirements:
1. Clear the container first: \`d3.select('#' + containerId).selectAll("*").remove();\`
2. Use modern D3.js (v7) syntax.
3. The background should be dark. Be highly creative with colors, sizes, and layout.
4. ONLY return valid JavaScript code. Do NOT wrap it in markdown blockquotes like \`\`\`javascript. Just return the raw code.

Events data schema:
${JSON.stringify(events.slice(-15), null, 2)} // Sending last 15 for context length limits
        `;

        const code = await AiProviderManager.generate(prompt);
        
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, code }));
      } catch (err: any) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

export default router;
