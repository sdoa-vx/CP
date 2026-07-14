# ──────────────────────────────────────────────────────────────────
# File:    ExplainModuleWorkflow.py
# Version: 5.0.0
# Updated: 2026-06-17T00:00:00Z
# Changes: Relocated to canonical sdoavx/ structure
# ──────────────────────────────────────────────────────────────────
# Last modified: 2026-06-03 05:25 UTC
# ============================================================
# ExplainModuleWorkflow.py — SDOA v5.0 Workflow (Python)
# version: 5.0.0
# ============================================================

# MANIFEST = {
#   id: "ExplainModuleWorkflow.workflow",
#   type: "workflow",
#   layer: 3,
#   runtime: "Python",
#   version: "5.0.0",
#   operationalRole: "savant",
#   requires: ["QmdAdapter", "LlmBridge"],
#   capabilities: ["explain_module_context"],
#   dependencies: ["QmdAdapter", "LlmBridge"],
#   docs: {
#     description: "Python-based workflow to retrieve context and explain SDOA modules via LLM bridge.",
#     author: "ProtoAI team",
#     sdoa: "5.0.0"
#   }
# };

MANIFEST_JSON = """
"MANIFEST" : {
  "id": "ExplainModuleWorkflow.workflow",
  "type": "workflow",
  "layer": 3,
  "runtime": "Python",
  "version": "5.0.0",
  "operationalRole": "savant",
  "requires": ["QmdAdapter", "LlmBridge"],
  "capabilities": ["explain_module_context"],
  "dependencies": ["QmdAdapter", "LlmBridge"],
  "docs": {
    "description": "Python-based workflow to retrieve context and explain SDOA modules via LLM bridge.",
    "author": "ProtoAI team",
    "sdoa": "5.0.0"
  }
}
"""

from base import Service

MANIFEST = {
    "id": "ExplainModuleWorkflow.workflow",
    "type": "workflow",
    "layer": 3,
    "runtime": "Python",
    "version": "5.0.1",
    "last_modified": "2026-07-13T00:00:00Z",
    "operationalRole": "savant",
    "requires": ["QmdAdapter", "LlmBridge"],
    "capabilities": ["explain_module_context"],
    "dependencies": ["QmdAdapter", "LlmBridge"],
    "docs": {
        "description": "Python-based workflow to retrieve context and explain SDOA modules via LLM bridge.",
        "author": "ProtoAI team",
        "sdoa": "5.0.0"
    }
}

class ExplainModuleWorkflow(Service):
    def explain(self, module_id: str):
        qmd = self.registry.get("QmdAdapter")
        llm = self.registry.get("LlmBridge")

        # 1. Acquire Context via qmd (High-precision retrieval)
        code_snippets = qmd.query(f"SELECT content FROM snippets WHERE file LIKE '%{module_id}%'")
        manifest_data = qmd.search(f"What are the dependencies of {module_id}?")

        # 2. Synthesize Prompt
        prompt = f"""
        Explain this SDOA module.
        CODE SNIPPETS: {code_snippets}
        MANIFEST CONTEXT: {manifest_data}
        """

        # 3. Generate via Bridge
        response = llm.generate(
            prompt=prompt,
            systemPrompt="Explain the architectural role and logic of the provided code."
        )

        return response['text']
