# ──────────────────────────────────────────────────────────────────
# File:    ProvisioningService.py
# Version: 1.0.3
# Updated: 2026-06-17T00:00:00Z
# Changes: Relocated to canonical sdoavx/ structure
# ──────────────────────────────────────────────────────────────────
# Last modified: 2026-06-03 06:25 UTC
# ============================================================
# ProvisioningService.py — SDOA v5.0 Provisioning Service (Python)
# version: 1.0.3
# ============================================================

# MANIFEST = {
#   id: "ProvisioningService.service",
#   type: "service",
#   layer: 3,
#   runtime: "Python",
#   version: "1.0.3",
#   operationalRole: "savant",
#   requires: ["BunInstaller"],
#   capabilities: ["verify_environment", "request_provisioning"],
#   dependencies: ["BunInstaller"],
#   docs: {
#     description: "Verifies python environment and requests bun installations if missing.",
#     author: "ProtoAI Team",
#     sdoa: "5.0.0"
#   }
# };

MANIFEST_JSON = """
"MANIFEST" : {
  "id": "ProvisioningService.service",
  "type": "service",
  "layer": 3,
  "runtime": "Python",
  "version": "1.0.3",
  "operationalRole": "savant",
  "requires": ["BunInstaller"],
  "capabilities": ["verify_environment", "request_provisioning"],
  "dependencies": ["BunInstaller"],
  "docs": {
    "description": "Verifies python environment and requests bun installations if missing.",
    "author": "ProtoAI Team",
    "sdoa": "5.0.0"
  }
}
"""

from base import Service

MANIFEST = {
    "id": "ProvisioningService.service",
    "type": "service",
    "layer": 3,
    "runtime": "Python",
    "version": "1.0.4",
    "last_modified": "2026-07-13T00:00:00Z",
    "operationalRole": "savant",
    "requires": ["BunInstaller"],
    "capabilities": ["verify_environment", "request_provisioning"],
    "dependencies": ["BunInstaller"],
    "docs": {
        "description": "Verifies python environment and requests bun installations if missing.",
        "author": "ProtoAI Team",
        "sdoa": "5.0.0"
    }
}

class ProvisioningService(Service):
    def verify_environment(self):
        installer = self.registry.get("BunInstaller")

        if not installer.isInstalled():
            self.bump_patch("Bun runtime missing. Requesting provisioning.")
            return installer.install() # Triggers the JS-based installer

        return True
