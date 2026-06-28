// ──────────────────────────────────────────────────────────────────
// File:    MemoryContextBroker.service.js
// Version: 5.2.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-03 11:18 UTC
// Module Type: service | Operational Role: savant
// Version: 5.2.0 | Runtime: NodeJS

"use strict";

class MemoryContextBrokerService {
  static MANIFEST = {
    id: "MemoryContextBroker.service",
    type: "service",
    layer: 3,
    runtime: "NodeJS",
    version: "5.2.0",
    operationalRole: "savant",
    requires: ["Memory.repository"],
    capabilities: ["memory_mutation_journaling", "context_compilation"],
    dependencies: [],
    lifecycle: ["init"],
    actions: {
      commands: {
        register_mutation: { description: "Logs live data mutations to the buffer cache" },
        compile_context: { description: "Stitches memory layers cleanly for prompt ingestion" },
        clear_buffer: { description: "Purges targeted transactional RAM caches." }
      },
      events: {},
      accepts: {}
    },
    optimization: {
      priority: "speed",
      assertionSuite: "MemoryContextBroker.tests.json"
    },
    docs: {
      description: "Coordinates memory state tracking and provides high-speed compilation hashing with bounded cache safety.",
      author: "SDOA Core Architecture Group",
      sdoa: "5.0.0"
    }
  };

  async init(registry) {
    this.registry = registry;
    this.repo = registry.get("Memory.repository");
    this.unconsolidatedBuffer = new Map();
    this.mutationCounters = new Map();
    this.compilationCache = new Map(); // key -> { counter, distilledSignature, compiled }
  }

  async execute(commandName, payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("[MemoryContextBroker.service] Payload must be a valid object.");
    }
    switch (commandName) {
      case "register_mutation":
        return await this.registerMutation(payload.namespace, payload.targetId, payload.rawItem);
      case "compile_context":
        return this.compileImmediateContext(payload.namespace, payload.targetId, payload.physicalDistilled);
      case "clear_buffer":
        this.clearBuffer(payload.namespace, payload.targetId);
        return true;
      default:
        throw new Error(`[MemoryContextBroker.service] Unrecognized Action Route: ${commandName}`);
    }
  }

  async registerMutation(namespace, targetId, rawItem) {
    const key = `${namespace}:${targetId}`;
    if (!this.unconsolidatedBuffer.has(key)) {
      this.unconsolidatedBuffer.set(key, []);

      // Enforce bounded memory footprint (FIFO eviction)
      if (this.unconsolidatedBuffer.size > 200) {
        const oldestKey = this.unconsolidatedBuffer.keys().next().value;
        this.unconsolidatedBuffer.delete(oldestKey);
        this.mutationCounters.delete(oldestKey);
      }
    }
    this.unconsolidatedBuffer.get(key).push(rawItem);
    const currentCount = (this.mutationCounters.get(key) || 0) + 1;
    this.mutationCounters.set(key, currentCount);
    return currentCount;
  }

  clearBuffer(namespace, targetId) {
    const key = `${namespace}:${targetId}`;
    this.unconsolidatedBuffer.delete(key);
    this.mutationCounters.set(key, 0);
    this.compilationCache.delete(key);
  }

  compileImmediateContext(namespace, targetId, physicalDistilled) {
    const key = `${namespace}:${targetId}`;
    const pendingItems = this.unconsolidatedBuffer.get(key) || [];
    const currentCounter = this.mutationCounters.get(key) || 0;

    // Low-overhead fingerprint calculation: build a string signature out of array entry IDs
    // instead of performing heavy full object stringification scans
    const distilledArray = Array.isArray(physicalDistilled) ? physicalDistilled : (physicalDistilled ? [physicalDistilled] : []);
    const distilledSignature = distilledArray.map(item => item.id || '').join(':');

    // Check Compilation Cache
    const cached = this.compilationCache.get(key);
    if (cached && cached.counter === currentCounter && cached.distilledSignature === distilledSignature) {
      return cached.compiled;
    }

    let outputBlocks = [];

    for (const item of distilledArray) {
      if (!item || !item.type) continue;
      let block = `[MEMORY:${item.type.toUpperCase()}:DISTILLED]\n`;
      if (item.content) {
        if (item.content.summary) {
          block += `- Summary: ${item.content.summary}\n`;
        }
        if (item.content.constraints && Array.isArray(item.content.constraints)) {
          item.content.constraints.forEach(c => block += `- Constraint: ${c}\n`);
        }
      }
      outputBlocks.push(block);
    }

    if (pendingItems.length > 0) {
      let block = `[MEMORY:${namespace.toUpperCase()}:PENDING_DISTILLATION]\n`;
      for (const item of pendingItems) {
        if (!item) continue;
        const content = item.content || {};

        if (content.verbatim) {
          if (Array.isArray(content.verbatim)) {
            content.verbatim.forEach(v => block += `- Live Directive: ${v}\n`);
          } else {
            block += `- Live Directive: ${content.verbatim}\n`;
          }
        }
        if (content.constraints) {
          if (Array.isArray(content.constraints)) {
            content.constraints.forEach(c => block += `- Live Constraint: ${c}\n`);
          } else {
            block += `- Live Constraint: ${content.constraints}\n`;
          }
        }
      }
      outputBlocks.push(block);
    }

    const compiled = outputBlocks.join("\n");

    // Store in Compilation Cache
    this.compilationCache.set(key, {
      counter: currentCounter,
      distilledSignature,
      compiled
    });

    // Enforce bounded cache memory footprint (FIFO eviction)
    if (this.compilationCache.size > 200) {
      const oldestKey = this.compilationCache.keys().next().value;
      this.compilationCache.delete(oldestKey);
    }

    return compiled;
  }
}

module.exports = MemoryContextBrokerService;
