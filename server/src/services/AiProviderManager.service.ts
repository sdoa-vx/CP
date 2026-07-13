import { PrimeDiscovery } from "./PrimeDiscovery.service";
import { Chronicle } from "./Chronicle.service";

export interface ProviderStatus {
  id: string;
  name: string;
  status: "connected" | "offline" | "not_configured";
  details?: string;
}

export class AiProviderManagerService {
  
  async init() {
    // Initialization
  }

  async run() {
    return { status: "ready" };
  }

  async dispose() {
    // Cleanup
  }

  async getProvidersStatus(): Promise<ProviderStatus[]> {
    const providers: ProviderStatus[] = [];

    // 1. Check local Ollama
    try {
      const tagsRes = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1000) });
      if (tagsRes.ok) {
        providers.push({ id: "ollama", name: "Ollama (Local)", status: "connected", details: "Ready" });
      } else {
        providers.push({ id: "ollama", name: "Ollama (Local)", status: "offline", details: "Connection refused" });
      }
    } catch (e) {
      providers.push({ id: "ollama", name: "Ollama (Local)", status: "offline", details: "Not running on port 11434" });
    }

    // 2. Check OpenAI
    const openAiKey = PrimeDiscovery.getSetting("api_key_openai");
    if (openAiKey) {
      providers.push({ id: "openai", name: "OpenAI", status: "connected", details: "Key configured" });
    } else {
      providers.push({ id: "openai", name: "OpenAI", status: "not_configured", details: "Needs API Key" });
    }

    // 3. Check Gemini
    const geminiKey = PrimeDiscovery.getSetting("api_key_gemini");
    if (geminiKey) {
      providers.push({ id: "gemini", name: "Google Gemini", status: "connected", details: "Key configured" });
    } else {
      providers.push({ id: "gemini", name: "Google Gemini", status: "not_configured", details: "Needs API Key" });
    }

    // 4. Check OpenRouter
    const openRouterKey = PrimeDiscovery.getSetting("api_key_openrouter");
    if (openRouterKey) {
      providers.push({ id: "openrouter", name: "OpenRouter", status: "connected", details: "Key configured" });
    } else {
      providers.push({ id: "openrouter", name: "OpenRouter", status: "not_configured", details: "Needs API Key" });
    }

    // 5. Check Anthropic
    const anthropicKey = PrimeDiscovery.getSetting("api_key_anthropic");
    if (anthropicKey) {
      providers.push({ id: "anthropic", name: "Anthropic", status: "connected", details: "Key configured" });
    } else {
      providers.push({ id: "anthropic", name: "Anthropic", status: "not_configured", details: "Needs API Key" });
    }

    // 6. Procedural Mock (Always available)
    providers.push({ id: "procedural", name: "Minimal Procedural (No AI)", status: "connected", details: "Always available" });

    return providers;
  }

  async generate(prompt: string, requestedProviderId?: string): Promise<string> {
    const statuses = await this.getProvidersStatus();
    
    // Auto-select best provider if none explicitly requested
    let selected = requestedProviderId;
    if (!selected) {
      const connected = statuses.filter(p => p.status === "connected");
      if (connected.length === 0) {
        throw new Error("NO_PROVIDERS");
      }
      // Priority: 1. Anthropic, 2. OpenAI, 3. OpenRouter, 4. Gemini, 5. Ollama, 6. Procedural
      if (connected.find(p => p.id === "anthropic")) selected = "anthropic";
      else if (connected.find(p => p.id === "openai")) selected = "openai";
      else if (connected.find(p => p.id === "openrouter")) selected = "openrouter";
      else if (connected.find(p => p.id === "gemini")) selected = "gemini";
      else if (connected.find(p => p.id === "ollama")) selected = "ollama";
      else selected = "procedural";
    }

    Chronicle.recordEvent("ai_provider:generating", { provider: selected }, "AiProviderManager");

    switch (selected) {
      case "ollama":
        return this._generateOllama(prompt);
      case "openai":
        return this._generateOpenAI(prompt);
      case "anthropic":
        return this._generateAnthropic(prompt);
      case "openrouter":
        return this._generateOpenRouter(prompt);
      case "gemini":
        return this._generateGemini(prompt);
      case "procedural":
        return this._generateProcedural(prompt);
      default:
        throw new Error(`Provider ${selected} not supported.`);
    }
  }

  private async _generateOllama(prompt: string): Promise<string> {
    const tagsRes = await fetch("http://127.0.0.1:11434/api/tags");
    const tagsData = await tagsRes.json();
    let model = "llama3";
    if (tagsData.models && tagsData.models.length > 0) {
      const codeModel = tagsData.models.find((m: any) => m.name.includes("codellama") || m.name.includes("qwen") || m.name.includes("deepseek"));
      model = codeModel ? codeModel.name : tagsData.models[0].name;
    }

    const res = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.2 }
      })
    });
    if (!res.ok) throw new Error("Ollama generation failed");
    const result = await res.json();
    return this._stripMarkdown(result.response);
  }

  private async _generateOpenAI(prompt: string): Promise<string> {
    const apiKey = PrimeDiscovery.getSetting("api_key_openai");
    if (!apiKey) throw new Error("OpenAI API Key not configured");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI failed: ${err}`);
    }
    const result = await res.json();
    return this._stripMarkdown(result.choices[0].message.content);
  }

  private async _generateOpenRouter(prompt: string): Promise<string> {
    const apiKey = PrimeDiscovery.getSetting("api_key_openrouter");
    if (!apiKey) throw new Error("OpenRouter API Key not configured");

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:8080",
        "X-Title": "SDOA Local Autonomous Engine"
      },
      body: JSON.stringify({
        model: "openrouter/fusion", // Auto-routes to the best model
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenRouter failed: ${err}`);
    }
    const result = await res.json();
    return this._stripMarkdown(result.choices[0].message.content);
  }

  private async _generateGemini(prompt: string): Promise<string> {
    const apiKey = PrimeDiscovery.getSetting("api_key_gemini");
    if (!apiKey) throw new Error("Gemini API Key not configured");

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini failed: ${err}`);
    }
    const result = await res.json();
    return this._stripMarkdown(result.candidates[0].content.parts[0].text);
  }

  private async _generateAnthropic(prompt: string): Promise<string> {
    const apiKey = PrimeDiscovery.getSetting("api_key_anthropic");
    if (!apiKey) throw new Error("Anthropic API Key not configured");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Anthropic failed: ${err}`);
    }
    const result = await res.json();
    return this._stripMarkdown(result.content[0].text);
  }

  private _generateProcedural(prompt: string): string {
    // Extract candidate name from prompt hackily since we just have the prompt string here
    const match = prompt.match(/Name: (.*?)\n/);
    const name = match ? match[1].trim() : "Generated";
    
    return `
export const MANIFEST = {
  id: "${name}",
  type: "service",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "synthesized:procedural:capability"
  ],
  dependencies: [],
  docs: "Procedurally generated fallback module."
};

export class ${name}Service {
  async init() {
    console.log("[${name}] Initialized via Procedural Fallback");
  }

  async run() {
    return { status: "ready" };
  }
  
  async dispose() {
  }
}

export const ${name} = new ${name}Service();
`;
  }

  private _stripMarkdown(code: string): string {
    if (code.includes("```")) {
      const match = code.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
      if (match) return match[1].trim();
    }
    return code.trim();
  }
}

export const AiProviderManager = new AiProviderManagerService();
