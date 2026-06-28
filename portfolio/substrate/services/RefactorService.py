# ──────────────────────────────────────────────────────────────────
# File:    RefactorService.py
# Version: 1.1.2
# Updated: 2026-06-17T00:00:00Z
# Changes: Relocated to canonical sdoavx/ structure
# ──────────────────────────────────────────────────────────────────
# Last modified: 2026-06-03 06:30 UTC
# ============================================================
# RefactorService.py — SDOA v5.0 Refactor Service (Python)
# version: 1.1.2
# ============================================================

# MANIFEST = {
#   id: "RefactorService",
#   type: "service",
#   layer: 3,
#   runtime: "Python",
#   version: "1.1.2",
#   operationalRole: "savant",
#   requires: ["ContextEngine", "LlmBridge"],
#   capabilities: ["propose_refactor"],
#   dependencies: ["ContextEngine", "LlmBridge"],
#   docs: {
#     description: "Senior SDOA Architect proposing precise refactors via context and LLM bridge.",
#     author: "ProtoAI Team",
#     sdoa: "5.0.0"
#   }
# };

MANIFEST_JSON = """
"MANIFEST" : {
  "id": "RefactorService",
  "type": "service",
  "layer": 3,
  "runtime": "Python",
  "version": "1.1.2",
  "operationalRole": "savant",
  "requires": ["ContextEngine", "LlmBridge"],
  "capabilities": ["propose_refactor"],
  "dependencies": ["ContextEngine", "LlmBridge"],
  "docs": {
    "description": "Senior SDOA Architect proposing precise refactors via context and LLM bridge.",
    "author": "ProtoAI Team",
    "sdoa": "5.0.0"
  }
}
"""

from base import Service

MANIFEST = {
    "id": "RefactorService",
    "type": "service",
    "layer": 3,
    "runtime": "Python",
    "version": "1.1.2",
    "operationalRole": "savant",
    "requires": ["ContextEngine", "LlmBridge"],
    "capabilities": ["propose_refactor"],
    "dependencies": ["ContextEngine", "LlmBridge"],
    "docs": {
        "description": "Senior SDOA Architect proposing precise refactors via context and LLM bridge.",
        "author": "ProtoAI Team",
        "sdoa": "5.0.0"
    }
}

class RefactorService(Service):
    def propose_refactor(self, target_module: str, goal: str):
        # 1. Acquire consolidated context from our Broker
        context = self.registry.get("ContextEngine").get_refactor_context(target_module)

        # 2. Build a high-signal prompt
        prompt = f"""
        Architectural Goal: {goal}
        Target Codebase: {context['code']}
        Related Patterns: {context['logic']}
        """

        # 3. Request generation through the Bridge (handles fail-over/credits)
        return self.registry.get("LlmBridge").generate(
            prompt=prompt,
            systemPrompt="You are a Senior SDOA Architect. Propose precise refactors.",
            tier="high_reasoning"
        )
