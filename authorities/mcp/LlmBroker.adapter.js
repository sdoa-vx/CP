export class LlmBroker {
  static MANIFEST = {
    id: "LlmBroker.adapter",
    type: "adapter",
    version: "1.0.0",
    runtime: "NodeJS",
    capabilities: ["llm:routing"],
    dependencies: [],
    docs: { description: "Routes phases to Ollama models" },
    last_modified: "2026-06-18T00:00:00Z",
    layer: 3,
    requires: [],
    dataFiles: [],
    lifecycle: ["init", "run", "dispose"],
    actions: { commands: {}, events: {}, accepts: {}, slots: {} },
    operationalRole: "registrar",
    optimization: { priority: "medium", assertionSuite: "standard" }
  };

  constructor(registry) {
    this.registry = registry;
    this.models = {
      analyze: 'llama3.2',
      map: 'llama3.2',
      reuse: 'codellama',
      innovate: 'llama3:8b',
      plan: 'llama3.2',
      patch: 'codellama',
      audit: 'llama3.2',
      migrate: 'codellama',
      verify: 'llama3.2',
      embed: 'nomic-embed-text'
    };
    this.ollamaEndpoint = 'http://127.0.0.1:11434/api/generate';
  }

  init(registry) {
    this.registry = registry;
    return { ok: true, data: { status: 'LlmBroker initialized' } };
  }

  async run(payload) {
    const { phase, prompt, options } = payload;
    const model = this.models[phase] || 'llama3.2';

    try {
      const result = await this._callOllama(model, prompt, options);
      return { ok: true, data: { model, result } };
    } catch (error) {
      return { ok: false, error: `LLM Call failed: ${error.message}` };
    }
  }

  dispose() {
    this.registry = null;
    return { ok: true };
  }

  async _callOllama(model, prompt, options = {}) {
    // Note: Using global fetch
    const response = await fetch(this.ollamaEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        ...options
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }
}

export default LlmBroker;
