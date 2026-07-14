# ──────────────────────────────────────────────────────────────────
# File:    ContextEngine.py
# Version: 1.2.3
# Updated: 2026-06-27T00:00:00Z
# Changes: V4 compliance — get_refactor_context is now async so that
#          QmdAdapter calls (cross-runtime via PolyglotBridge) can be
#          properly awaited; SQL query parameterized to prevent
#          injection; assertionSuite id added to MANIFEST.
# ──────────────────────────────────────────────────────────────────
# Last modified: 2026-06-27
# ============================================================
# ContextEngine.py — SDOA v5.0 Context Engine (Python)
# version: 1.2.3
# ============================================================

# MANIFEST = {
#   id: "ContextEngine.engine",
#   type: "engine",
#   layer: 3,
#   runtime: "Python",
#   version: "1.2.3",
#   operationalRole: "savant",
#   requires: ["QmdAdapter"],
#   capabilities: ["get_refactor_context"],
#   dependencies: ["QmdAdapter"],
#   optimization: { assertionSuite: "ContextEngine.assertions" },
#   docs: {
#     description: "Context consolidation and semantic retrieval engine.",
#     author: "ProtoAI Team",
#     sdoa: "5.0.0"
#   }
# };

MANIFEST_JSON = """
"MANIFEST" : {
  "id": "ContextEngine.engine",
  "type": "engine",
  "layer": 3,
  "runtime": "Python",
  "version": "1.2.3",
  "operationalRole": "savant",
  "requires": ["QmdAdapter"],
  "capabilities": ["get_refactor_context"],
  "dependencies": ["QmdAdapter"],
  "optimization": { "assertionSuite": "ContextEngine.assertions" },
  "docs": {
    "description": "Context consolidation and semantic retrieval engine.",
    "author": "ProtoAI Team",
    "sdoa": "5.0.0"
  }
}
"""

from base import Service

MANIFEST = {
    "id": "ContextEngine.engine",
    "type": "engine",
    "layer": 3,
    "runtime": "Python",
    "version": "1.2.4",
    "last_modified": "2026-07-13T00:00:00Z",
    "operationalRole": "savant",
    "requires": ["QmdAdapter"],
    "capabilities": ["get_refactor_context"],
    "dependencies": ["QmdAdapter"],
    "optimization": {"assertionSuite": "ContextEngine.assertions"},
    "docs": {
        "description": "Context consolidation and semantic retrieval engine.",
        "author": "ProtoAI Team",
        "sdoa": "5.0.0"
    }
}

class ContextEngine(Service):
    async def get_refactor_context(self, feature_name: str):
        # QmdAdapter is a NodeJS sovereign accessed via PolyglotBridge —
        # both calls are async and must be awaited.
        qmd = self.registry.get("QmdAdapter")

        logic_map = await qmd.search(f"logic related to {feature_name}")

        # Parameterized query prevents SQL injection via feature_name
        raw_snippets = await qmd.query(
            "SELECT path, content FROM snippets WHERE content LIKE ? LIMIT 5",
            (f"%{feature_name}%",)
        )

        return {
            "intent": feature_name,
            "logic": [res for res in logic_map if res["score"] > 0.75],
            "code": raw_snippets
        }
