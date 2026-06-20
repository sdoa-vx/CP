export class EmbeddingService {
  static MANIFEST = {
    id: "EmbeddingService.service",
    type: "service",
    version: "1.0.0",
    runtime: "NodeJS",
    capabilities: ["llm:embedding"],
    dependencies: [],
    docs: { description: "Generates and stores embeddings" },
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
    this.ollamaEndpoint = 'http://127.0.0.1:11434/api/embeddings';
    this.model = 'nomic-embed-text';
  }

  init(registry) {
    this.registry = registry;
    return { ok: true, data: { status: 'EmbeddingService initialized' } };
  }

  async run(payload) {
    const { action, text, vectorA, vectorB, id, vector } = payload;
    
    switch (action) {
      case 'generate':
        return await this.generateEmbedding(text);
      case 'store':
        return this.storeEmbedding(id, vector);
      case 'similarity':
        return this.cosineSimilarity(vectorA, vectorB);
      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  }

  dispose() {
    this.registry = null;
    return { ok: true };
  }

  async generateEmbedding(text) {
    try {
      const response = await fetch(this.ollamaEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: text
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP Error: ${response.status}`);
      }

      const data = await response.json();
      return { ok: true, data: { embedding: data.embedding } };
    } catch (error) {
      return { ok: false, error: `Embedding generation failed: ${error.message}` };
    }
  }

  storeEmbedding(id, vector) {
    // Stub: SQLite BLOB insertion
    // In a real implementation, this would prepare a statement and save the Float32Array or JSON
    const buffer = Buffer.from(new Float32Array(vector).buffer);
    console.log(`[EmbeddingService] Storing vector for id ${id} (Buffer length: ${buffer.length})`);
    
    return { ok: true, data: { id, status: 'STORED' } };
  }

  cosineSimilarity(vectorA, vectorB) {
    if (!vectorA || !vectorB || vectorA.length !== vectorB.length) {
      return { ok: false, error: 'Vectors must be valid and of the same length' };
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    if (normA === 0 || normB === 0) {
      return { ok: true, data: { similarity: 0 } };
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return { ok: true, data: { similarity } };
  }
}

export default EmbeddingService;
