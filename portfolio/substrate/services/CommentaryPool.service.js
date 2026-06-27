// ──────────────────────────────────────────────────────────────────
// File:    CommentaryPool.service.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-03 05:00 UTC
// Formatted by Antigravity; Validated by ProbationOfficer
//
// SDOA v5.0 Service (NodeJS)
// Refactored from: C:\Projects\SDOAvX\non-sdoavx\server_orchestration_CommentaryPool.js

"use strict";

class CommentaryPoolService {
  static MANIFEST = {
    // ── Identity ──────────────────────────────
    id:              "CommentaryPool.service",
    type:            "service",
    layer:           3,
    runtime:         "NodeJS",
    version:         "5.0.0",
    operationalRole: "savant",

    // ── Dependencies & Capabilities ───────────
    capabilities:    ["parallel_commentary", "side_channel_inference"],
    dependencies:    ["SendMessageWorkflow", "MultiModelOrchestrator"],
    requires:        ["SendMessageWorkflow", "MultiModelOrchestrator"],
    dataFiles:       [],

    // ── Lifecycle ─────────────────────────────
    lifecycle: ["init", "run", "dispose"],

    // ── Action Surface ────────────────────────
    actions: {
      commands: {
        generateParallel: {
          description: "Fans out parallel requests to generate commentary for requested personas.",
          input: {
            message: "string",
            primeReply: "string",
            activeFacets: "array",
            isOpenRouterAvailable: "boolean",
            msgId: "string?"
          },
          output: "void"
        }
      },
      events: {},
      accepts: {},
      slots: {}
    },

    docs: {
      description: "Service that fans out parallel requests to generate side-channel commentary for all requested personas via OpenRouter and Local LLMs.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    }
  };

  constructor() {
    this.activePromises = new Map();
    this.registry = null;
    this.orchestrator = null;
  }

  async init(registry) {
    this.registry = registry;
    this.orchestrator = registry.get("MultiModelOrchestrator");
  }

  async run() {
    return { status: "ready" };
  }

  async dispose() {
    this.activePromises.clear();
  }

  /**
   * Fans out requests to generate commentary for all requested personas.
   * @param {object} params - The inputs as declared in commands
   */
  generateParallel(message, primeReply, activeFacets, isOpenRouterAvailable, msgId = null) {
    let finalMsg = message;
    let finalReply = primeReply;
    let finalFacets = activeFacets;
    let finalOrAvailable = isOpenRouterAvailable;
    let finalMsgId = msgId;

    if (typeof message === "object" && message !== null && primeReply === undefined) {
      finalMsg = message.message;
      finalReply = message.primeReply;
      finalFacets = message.activeFacets;
      finalOrAvailable = message.isOpenRouterAvailable;
      finalMsgId = message.msgId || null;
    }

    if (!finalFacets || finalFacets.length === 0) return;
    if (!finalReply) return;

    const logger = this.registry?.get("Logger.service") || console;
    logger.log(`[CommentaryPool] Fanning out commentary for: ${finalFacets.join(', ')}`);

    finalFacets.forEach((persona, index) => {
      const useOpenRouter = finalOrAvailable && (index % 2 === 0);

      this._triggerPersona(persona, finalMsg, finalReply, useOpenRouter, finalMsgId)
        .catch(err => {
          if (logger.error) logger.error(`[CommentaryPool] Error on ${persona}: ${err.message}`);
          else console.error(`[CommentaryPool] Error on ${persona}:`, err.message);
        });
    });
  }

  async _triggerPersona(persona, message, primeReply, useOpenRouter, msgId) {
    const logger = this.registry?.get("Logger.service") || console;
    logger.log(`[CommentaryPool] Generating ${persona} via ${useOpenRouter ? 'OpenRouter' : 'Local 1.5B'}...`);

    if (this.orchestrator) {
      this.orchestrator.emit("orchestrator:commentary_generating", { persona });
    }

    let text = "";
    let rewriteText = null;
    let useLocalFallback = !useOpenRouter;

    if (useOpenRouter) {
      try {
        const toneMap = {
          advisor: "practical, experienced, mentor-like",
          critic:  "direct, skeptical, demanding quality",
          friend:  "warm, casual, encouraging",
          comedy:  "dry wit, lightly sarcastic, quick",
          slutty:  "flirtatious, highly suggestive, overly affectionate",
          slutty_nsfw: "explicitly flirtatious, highly sexually suggestive, uninhibited and NSFW",
          scary:   "intimidating, menacing, unnerving, slightly hostile",
          scared:  "paranoid, nervous, anxious, constantly worried",
          alien:   "confused by earth customs, highly analytical but bizarre, speaking like an extraterrestrial",
        };
        const tone = toneMap[persona] || toneMap.advisor;

        const sys = [
          `You are a concise AI sidebar assistant. Your tone is: ${tone}.`,
          "Respond with exactly 1-2 sentences. Output ONLY your observation — no labels, no preamble.",
          (primeReply && (persona === "critic" || persona === "advisor")) ? "If the AI's reply is inefficient or could be better, append exactly this to your output: [REWRITE: your new rewritten paragraph]." : "",
        ].filter(Boolean).join("\n");

        const prompt = `The developer asked: "${message.slice(0, 180)}"\nThe AI replied: "${primeReply.slice(0, 350)}"\n\nGive a ${tone} observation about this exchange:`;

        const personaModels = {
          advisor: "nv-super-free",
          critic:  "qwen-coder-30b",
          friend:  "gpt-oss-20-free",
          comedy:  "gpt-oss-20-free",
          slutty:  "gpt-oss-20-free",
          slutty_nsfw: "gpt-oss-20-free",
          scary:   "nv-super-free",
          scared:  "sonar-reason-pro",
          alien:   "openrouter-free"
        };
        const engineModel = personaModels[persona] || "openrouter/auto";

        const SendMessageWfClass = this.registry?.get("SendMessageWorkflow") || require("../workflows/SendMessage.workflow");
        const wf = new SendMessageWfClass();
        if (wf.init && this.registry) {
          await wf.init(this.registry);
        }
        const result = await wf.run({
          project: "global",
          message: prompt,
          engine: engineModel,
          systemPrompt: sys
        });

        if (result.status === "ok") {
          const rawText = (result.data?.reply || "").trim();
          text = rawText.replace(/^["'`]|["'`]$/g, "").trim();

          const rewriteMatch = text.match(/\[REWRITE:\s*([\s\S]+?)\]/i);
          if (rewriteMatch) {
            rewriteText = rewriteMatch[1].trim();
            text = text.replace(rewriteMatch[0], "").trim();
          }
        } else {
          throw new Error(result.error || "OR Workflow failed");
        }
      } catch (err) {
        const errMsg = `[CommentaryPool] OpenRouter failed for ${persona} (${err.message}). Falling back to local model.`;
        if (logger.error) logger.error(errMsg);
        else console.error(errMsg);
        useLocalFallback = true;
      }
    }

    if (useLocalFallback && this.orchestrator) {
      const res = await this.orchestrator.commentary(message, primeReply, persona, msgId);
      text = res.text;
    }

    if (text && this.orchestrator) {
      logger.log(`[CommentaryPool] ${persona} reply: ${text.slice(0, 50)}...`);
      if (useOpenRouter) {
        this.orchestrator.emit("orchestrator:commentary", { text, persona });
        if (rewriteText && msgId) {
          this.orchestrator.emit("orchestrator:continuity_editor_rewrite", { id: msgId, newText: rewriteText, persona, commentaryText: text });
        }
      }
    }
  }
}

module.exports = CommentaryPoolService;
