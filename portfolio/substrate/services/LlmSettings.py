# ──────────────────────────────────────────────────────────────────
# File:    LlmSettings.py
# Version: 1.2.0
# Updated: 2026-06-17T00:00:00Z
# Changes: Relocated to canonical sdoavx/ structure (rerouted from ui/dashboards/)
# ──────────────────────────────────────────────────────────────────
# Last modified: 2026-06-03 06:40 UTC
# ============================================================
# LlmSettings.py — SDOA v5.0 LLM Governance Portal (Python)
# version: 1.2.0
# ============================================================

# MANIFEST = {
#   id: "LlmSettings.service",
#   type: "service",
#   layer: 3,
#   runtime: "Python",
#   version: "1.2.0",
#   operationalRole: "savant",
#   requires: ["LlmPolicyEngine"],
#   capabilities: ["render_llm_settings", "update_failover_policy"],
#   dependencies: ["LlmPolicyEngine"],
#   docs: {
#     description: "Streamlit-based LLM governance and fail-over policy settings dashboard.",
#     author: "ProtoAI Team",
#     sdoa: "5.0.0"
#   }
# };

MANIFEST_JSON = """
"MANIFEST" : {
  "id": "LlmSettings.service",
  "type": "service",
  "layer": 3,
  "runtime": "Python",
  "version": "1.2.0",
  "operationalRole": "savant",
  "requires": ["LlmPolicyEngine"],
  "capabilities": ["render_llm_settings", "update_failover_policy"],
  "dependencies": ["LlmPolicyEngine"],
  "docs": {
    "description": "Streamlit-based LLM governance and fail-over policy settings dashboard.",
    "author": "ProtoAI Team",
    "sdoa": "5.0.0"
  }
}
"""

from base import Dashboard
import streamlit as st

MANIFEST = {
    "id": "LlmSettings.service",
    "type": "service",
    "layer": 3,
    "runtime": "Python",
    "version": "1.2.1",
    "last_modified": "2026-07-13T00:00:00Z",
    "operationalRole": "savant",
    "requires": ["LlmPolicyEngine"],
    "capabilities": ["render_llm_settings", "update_failover_policy"],
    "dependencies": ["LlmPolicyEngine"],
    "docs": {
        "description": "Streamlit-based LLM governance and fail-over policy settings dashboard.",
        "author": "ProtoAI Team",
        "sdoa": "5.0.0"
    }
}

class LlmSettings(Dashboard):
    def render(self):
        st.title("LLM Governance Portal")
        policy_engine = self.registry.get("LlmPolicyEngine")
        current = policy_engine.getPolicy()

        st.subheader("Current Configuration")
        st.json(current)

        with st.form("update_policy"):
            new_primary = st.selectbox("Set Primary Provider", ["anthropic", "openai", "ollama"])
            new_model = st.text_input("Model ID", value=current['primary']['model'])

            if st.form_submit_button("Apply Fail-over Policy"):
                policy_engine.updatePolicy({
                    "primary": {"provider": new_primary, "model": new_model}
                })
                st.success("Policy updated across all SDOA modules.")
                st.rerun()
