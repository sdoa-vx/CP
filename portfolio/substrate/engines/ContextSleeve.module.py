# ──────────────────────────────────────────────────────────────────
# File:    ContextSleeve.module.py
# Version: 1.0.0
# Updated: 2026-06-27T00:00:00Z
# Changes: Phase 2 Step 6 — Sleeve ratification (SDOA v5.4 §2.7).
#          Replaces ContextEngine.py as the boundary sovereign for
#          the QmdAdapter semantic/SQL retrieval boundary.
#          external.system = "qmd-adapter",
#          transport = "polyglot-bridge".
#          V4 compliance retained: all calls are async/awaited,
#          SQL queries are parameterized.
# ──────────────────────────────────────────────────────────────────

# MANIFEST = {
#   id: "ContextSleeve.module",
#   type: "adapter",        # "sleeve" pending typedef extension
#   layer: 3,
#   runtime: "Python",
#   version: "1.0.0",
#   operationalRole: "savant",
#   requires: ["QmdAdapter", "ResponseFormatter.service", "PathResolver.service"],
#   capabilities: ["context.refactor", "context.semantic-search", "context.sql-query"],
#   external: {
#     system: "qmd-adapter",
#     transport: "polyglot-bridge",
#     path: "auto",
#     commands: ["search", "query"]
#   },
#   optimization: { assertionSuite: "ContextSleeve.assertions" },
#   docs: {
#     description: "Sleeve boundary module. Wraps QmdAdapter (NodeJS sovereign) via PolyglotBridge for semantic search and parameterized SQL retrieval. All cross-runtime calls are awaited. Never mutates SDOA source files.",
#     author: "ProtoAI Team",
#     sdoa: "5.4.0"
#   }
# };

MANIFEST_JSON = """
"MANIFEST" : {
  "id": "ContextSleeve.module",
  "type": "adapter",
  "layer": 3,
  "runtime": "Python",
  "version": "1.0.0",
  "operationalRole": "savant",
  "requires": ["QmdAdapter", "ResponseFormatter.service", "PathResolver.service"],
  "capabilities": ["context.refactor", "context.semantic-search", "context.sql-query"],
  "external": {
    "system": "qmd-adapter",
    "transport": "polyglot-bridge",
    "path": "auto",
    "commands": ["search", "query"]
  },
  "optimization": { "assertionSuite": "ContextSleeve.assertions" },
  "docs": {
    "description": "Sleeve boundary module wrapping QmdAdapter for semantic and SQL retrieval.",
    "author": "ProtoAI Team",
    "sdoa": "5.4.0"
  }
}
"""

from base import Service

MANIFEST = {
    "id": "ContextSleeve.module",
    "type": "adapter",
    "layer": 3,
    "runtime": "Python",
    "version": "1.0.1",
    "last_modified": "2026-07-13T00:00:00Z",
    "operationalRole": "savant",
    "requires": ["QmdAdapter", "ResponseFormatter.service", "PathResolver.service"],
    "dependencies": ["QmdAdapter", "ResponseFormatter.service", "PathResolver.service"],
    "capabilities": ["context.refactor", "context.semantic-search", "context.sql-query"],
    "external": {
        "system": "qmd-adapter",
        "transport": "polyglot-bridge",
        "path": "auto",
        "commands": ["search", "query"]
    },
    "optimization": {"assertionSuite": "ContextSleeve.assertions"},
    "docs": {
        "description": "Sleeve boundary module wrapping QmdAdapter for semantic and SQL retrieval.",
        "author": "ProtoAI Team",
        "sdoa": "5.4.0"
    }
}


class ContextSleeve(Service):
    """
    Sleeve boundary for the QmdAdapter (NodeJS) cross-runtime bridge.
    All QmdAdapter calls are async and must be awaited (V4 compliance).
    SQL queries are parameterized to prevent injection (V4 compliance).
    """

    async def get_refactor_context(self, feature_name: str):
        # QmdAdapter is NodeJS — accessed via PolyglotBridge; calls must be awaited
        qmd = self.registry.get("QmdAdapter")

        logic_map = await qmd.search(f"logic related to {feature_name}")

        # Parameterized query — feature_name is never interpolated into SQL (V4)
        raw_snippets = await qmd.query(
            "SELECT path, content FROM snippets WHERE content LIKE ? LIMIT 5",
            (f"%{feature_name}%",)
        )

        # Normalize output through ResponseFormatter shape
        return {
            "ok": True,
            "data": {
                "intent":   feature_name,
                "logic":    [res for res in logic_map if res["score"] > 0.75],
                "code":     raw_snippets
            }
        }
