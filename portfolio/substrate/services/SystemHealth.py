# ──────────────────────────────────────────────────────────────────
# File:    SystemHealth.py
# Version: 1.2.0
# Updated: 2026-06-17T00:00:00Z
# Changes: Relocated to canonical sdoavx/ structure
# ──────────────────────────────────────────────────────────────────
# Last modified: 2026-06-03 06:20 UTC
# ============================================================
# SystemHealth.py — SDOA v5.0 System Health Dashboard (Python)
# version: 1.2.0
# ============================================================

# MANIFEST = {
#   id: "SystemHealth",
#   type: "service",
#   layer: 3,
#   runtime: "Python",
#   version: "1.2.0",
#   operationalRole: "savant",
#   requires: ["ProvisioningService", "BunInstaller", "LlmPolicyEngine"],
#   capabilities: ["render_health_metrics", "force_economic_failover"],
#   dependencies: ["ProvisioningService", "BunInstaller", "LlmPolicyEngine"],
#   docs: {
#     description: "Streamlit Dashboard visualizing SDOA control plane and model policy settings.",
#     author: "ProtoAI Team",
#     sdoa: "5.0.0"
#   }
# };

MANIFEST_JSON = """
"MANIFEST" : {
  "id": "SystemHealth",
  "type": "service",
  "layer": 3,
  "runtime": "Python",
  "version": "1.2.0",
  "operationalRole": "savant",
  "requires": ["ProvisioningService", "BunInstaller", "LlmPolicyEngine"],
  "capabilities": ["render_health_metrics", "force_economic_failover"],
  "dependencies": ["ProvisioningService", "BunInstaller", "LlmPolicyEngine"],
  "docs": {
    "description": "Streamlit Dashboard visualizing SDOA control plane and model policy settings.",
    "author": "ProtoAI Team",
    "sdoa": "5.0.0"
  }
}
"""

from base import Dashboard
import streamlit as st

MANIFEST = {
    "id": "SystemHealth",
    "type": "service",
    "layer": 3,
    "runtime": "Python",
    "version": "1.2.0",
    "operationalRole": "savant",
    "requires": ["ProvisioningService", "BunInstaller", "LlmPolicyEngine"],
    "capabilities": ["render_health_metrics", "force_economic_failover"],
    "dependencies": ["ProvisioningService", "BunInstaller", "LlmPolicyEngine"],
    "docs": {
        "description": "Streamlit Dashboard visualizing SDOA control plane and model policy settings.",
        "author": "ProtoAI Team",
        "sdoa": "5.0.0"
    }
}

class SystemHealth(Dashboard):
    def render(self):
        st.title("SDOA Control Plane")

        # Sync with the Registry state
        policy = self.registry.get("LlmPolicyEngine").getPolicy()

        col1, col2 = st.columns(2)
        with col1:
            st.metric("Primary LLM", policy['primary']['provider'].upper())
            if st.button("Force Economic Fail-over"):
                self.registry.get("LlmPolicyEngine").updatePolicy({"primary": {"provider": "ollama"}})
                st.rerun()

        with col2:
            status = "Healthy" if self.registry.get("ProvisioningService").verify_environment() else "Broken"
            st.metric("Runtime Status", status)
