import * as http from "node:http";

export const MANIFEST = {
  id: "aiCapabilityScanner.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "detectAICapabilities"
  ],
  dependencies: [
    "node:http"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



export interface AIProvider {
  type: "ollama" | "openai" | "anthropic";
  name: string;
  endpoint: string;
  model: string;
  key?: string;
  priority: number;
}

export async function detectAICapabilities(): Promise<AIProvider[]> {
  const providers: AIProvider[] = [];

  // 1. Probe for Local Ollama (Priority 1 - Privacy first)
  try {
    const isOllamaAlive = await new Promise<boolean>((resolve) => {
      const req = http.get("http://127.0.0.1:11434/api/tags", (res) => {
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(500, () => resolve(false));
    });

    if (isOllamaAlive) {
      providers.push({
        type: "ollama",
        name: "Local Ollama",
        endpoint: "http://127.0.0.1:11434/api/generate",
        model: "llama3.2",
        priority: 3 // Lowest fidelity, fallback before AST
      });
    }
  } catch (e) {
    // silent fallback
  }

  // 2. Probe for Cloud OpenAI (High Fidelity)
  if (process.env.OPENAI_API_KEY) {
    providers.push({
      type: "openai",
      name: "OpenAI Cloud",
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o",
      key: process.env.OPENAI_API_KEY,
      priority: 2 // High fidelity
    });
  }

  // 3. Probe for Cloud Anthropic (Highest Fidelity)
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push({
      type: "anthropic",
      name: "Anthropic Cloud",
      endpoint: "https://api.anthropic.com/v1/messages",
      model: "claude-3-5-sonnet-20241022",
      key: process.env.ANTHROPIC_API_KEY,
      priority: 1 // Highest fidelity
    });
  }

  // Sort by priority (lowest number first)
  return providers.sort((a, b) => a.priority - b.priority);
}
