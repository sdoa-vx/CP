# ──────────────────────────────────────────────────────────────────
# File:    Coach.workflow.py
# Version: 5.3.0
# Updated: 2026-06-28T00:00:00Z
# Changes: Amendment 4.4 — Model upgrade approval path.
#          on_model_upgrade_proposed(event) receives sleeve:modelUpgradeProposed.
#          Validates quality (score >= QUALITY_THRESHOLD = 0.70).
#          If approved: emits coach:modelUpgradeApproved.
#          If rejected: emits coach:modelUpgradeRejected with reason.
#          Sleeve cannot self-approve — Coach is the sole gate.
# Previous: Amendment 3.2 — on_command_discovered() handler added.
#          Receives sleeve:commandDiscovered, computes a search/replace
#          patch on the external.commands array, and calls on_patch_request()
#          directly. The existing pipeline (ProbationOfficer → Registrar.
#          fieldChampion) validates and writes the amendment. Sleeves
#          cannot self-approve: this handler is the sole approval gate.
# Previous: Step 13 — Coach is now the sole healing path.
#          Added accepts: heal:patch-request so the registry routes
#          AiSleeve patch events here automatically.
#          on_patch_request() receives the event, reads the target
#          module source, applies the patch, and routes through
#          ProbationOfficer before Registrar re-fields the module.
# ──────────────────────────────────────────────────────────────────
# Last modified: 2026-06-08 15:40 UTC
# ============================================================
# Coach.workflow.py — SDOA v5.0 Workflow (Python)
# version: 5.0.0
# ============================================================

MANIFEST_JSON = """
{
  "MANIFEST": {
    "id": "Coach.workflow",
    "type": "workflow",
    "layer": 3,
    "runtime": "Python",
    "version": "5.3.0",
    "operationalRole": "savant",
    "requires": ["AiProvider.adapter", "ProbationOfficer.workflow"],
    "dataFiles": [],
    "lifecycle": ["init", "run", "dispose"],
    "actions": {
      "commands": {
        "run": {
          "description": "Diagnoses a test failure, requests an AI patch, emits mutation ready, and invokes ProbationOfficer.",
          "input": {
            "moduleId": "string",
            "suiteId": "string",
            "failures": "object[]",
            "moduleSource": "string",
            "moduleManifest": "object"
          },
          "output": "object"
        }
      },
      "events": {
        "coach:mutationReady": {
          "payload": {
            "moduleId": "string",
            "originalSource": "string",
            "mutatedSource": "string",
            "diff": "string"
          }
        },
        "coach:modelUpgradeApproved": {
          "payload": { "moduleId": "string", "adapterId": "string", "proposalId": "string", "approvedAt": "string", "validationScore": "number" }
        },
        "coach:modelUpgradeRejected": {
          "payload": { "moduleId": "string", "adapterId": "string", "proposalId": "string", "reason": "string" }
        }
      },
      "accepts": {
        "sleeve:modelUpgradeProposed": {
          "description": "Amendment 4.4 — receives a validated adapter proposal from a model sleeve. Coach validates quality score against QUALITY_THRESHOLD (0.70) and emits coach:modelUpgradeApproved or coach:modelUpgradeRejected. Sleeve cannot self-approve.",
          "payload": { "moduleId": "string", "adapterId": "string", "proposalId": "string", "validationScore": "number", "proposedReason": "string|null" }
        },
        "heal:patch-request": {
          "description": "Receives a patch synthesis result from AiSleeve. Coach applies the patch, validates via ProbationOfficer, then signals Registrar to re-field the module.",
          "payload": {
            "targetModuleId": "string",
            "patch": { "search": "string", "replace": "string" },
            "meta": "object"
          }
        },
        "sleeve:commandDiscovered": {
          "description": "Amendment 3.2 — receives discovery proposal from a sleeve. Coach computes a manifest amendment patch and routes it through the existing ProbationOfficer → Registrar.fieldChampion() pipeline. Coach is the sole approval gate; sleeves cannot self-approve.",
          "payload": {
            "moduleId": "string",
            "currentCommands": "string[]",
            "undeclaredCommands": "string[]",
            "proposalId": "string"
          }
        }
      },
      "slots": {}
    },
    "docs": {
      "description": "AI code repair coach.",
      "author": "ProtoAI Core Architecture Group",
      "sdoa": "5.0.0"
    }
  }
}
"""

import sys
import json
import difflib
from base import Service

class CoachWorkflow(Service):
    def run(self, payload=None):
        if not payload:
            return {"ok": False, "error": "Missing payload"}

        module_id = payload.get("moduleId")
        suite_id = payload.get("suiteId")
        failures = payload.get("failures", [])
        module_source = payload.get("moduleSource")
        module_manifest = payload.get("moduleManifest")

        if not module_id or not module_source:
            return {"ok": False, "error": "Missing required fields (moduleId, moduleSource)"}

        # 1. Fetch AI Provider and ProbationOfficer from Registry
        ai = self.registry.get("AiProvider.adapter")
        probation = self.registry.get("ProbationOfficer.workflow")

        if not ai:
            return {"ok": False, "error": "AiProvider.adapter is not available in registry"}

        # 2. Build detailed prompt for the repair
        failures_summary = json.dumps(failures, indent=2)
        manifest_summary = json.dumps(module_manifest, indent=2)

        prompt = f"""
You are the SDOA Self-Healing Engine. Fix the bug in the module '{module_id}'.

Failing test cases details:
{failures_summary}

Module Manifest:
{manifest_summary}

Original Source Code:
```javascript
{module_source}
```

Instructions:
1. Fix the bug in the code logic.
2. Increment the patch version in the MANIFEST version field (e.g. from 5.0.0 to 5.0.1).
3. Preserve all SDOA architectural constraints (do not reference window in L3, keep lines under limits).
4. Return ONLY the complete corrected source code block inside standard code fences. Do not add conversational text.
"""

        # 3. Request patch from LLM
        system_prompt = "You are a senior software architect specializing in self-healing systems and SDOA compliance."
        try:
            raw_response = ai.complete({
                "prompt": prompt,
                "system": system_prompt,
                "temperature": 0.2
            })
        except Exception as e:
            return {"ok": False, "error": f"LLM prompt failed: {str(e)}"}

        # Extract patched code block
        mutated_source = self._extract_code(raw_response)
        if not mutated_source:
            return {"ok": False, "error": "Failed to extract patched code from LLM response"}

        # 4. Generate Diff
        diff_lines = difflib.unified_diff(
            module_source.splitlines(),
            mutated_source.splitlines(),
            fromfile=f"original/{module_id}",
            tofile=f"patched/{module_id}",
            lineterm=""
        )
        diff_text = "\n".join(diff_lines)

        # 5. Emit EventBus event
        self.emit("coach:mutationReady", {
            "moduleId": module_id,
            "originalSource": module_source,
            "mutatedSource": mutated_source,
            "diff": diff_text
        })

        # 6. Route through ProbationOfficer if available
        if probation:
            try:
                validation = probation.run({
                    "moduleId": module_id,
                    "mutatedSource": mutated_source,
                    "originalSource": module_source
                })
                return {"ok": True, "patched": True, "validation": validation, "diff": diff_text}
            except Exception as e:
                return {"ok": True, "patched": True, "validationError": str(e), "diff": diff_text}

        return {"ok": True, "patched": True, "diff": diff_text}

    def _extract_code(self, text):
        if "```" not in text:
            return text.strip()

        # Parse content between code fences
        lines = text.splitlines()
        code_lines = []
        in_block = False

        for line in lines:
            if line.strip().startswith("```"):
                in_block = not in_block
                continue
            if in_block:
                code_lines.append(line)

        return "\n".join(code_lines).strip()

    # ── heal:patch-request handler ─────────────────────────────────
    # Called by the registry event bus when AiSleeve emits a
    # heal:patch-request event. Coach is the sole healing path —
    # no module may apply patches directly (Step 13).
    def on_patch_request(self, event):
        target_id = event.get("targetModuleId")
        patch     = event.get("patch", {})
        meta      = event.get("meta", {})

        if not target_id or not patch.get("search") or not patch.get("replace"):
            self.emit("coach:patchRejected", {
                "moduleId": target_id,
                "reason": "Malformed heal:patch-request payload"
            })
            return

        probation = self.registry.get("ProbationOfficer.workflow")
        registrar = self.registry.get("Registrar.service")

        # Read the target module source via registry (never direct fs write here)
        source = None
        try:
            module_instance = self.registry.get(target_id)
            source = getattr(module_instance, "__source__", None)
        except Exception:
            pass

        if not source:
            self.emit("coach:patchRejected", {
                "moduleId": target_id,
                "reason": f"Could not resolve source for {target_id} from registry"
            })
            return

        # Apply patch
        if patch["search"] not in source:
            self.emit("coach:patchRejected", {
                "moduleId": target_id,
                "reason": "search string not found in module source"
            })
            return

        mutated = source.replace(patch["search"], patch["replace"], 1)

        # Route through ProbationOfficer gate
        if probation:
            result = probation.run({"source_payload": mutated})
            if not result.get("data", {}).get("compliant", False):
                self.emit("coach:patchRejected", {
                    "moduleId": target_id,
                    "reason": result.get("data", {}).get("reason", "ProbationOfficer rejected patch")
                })
                return

        # Signal Registrar to re-field the module with the patched source
        self.emit("coach:mutationReady", {
            "moduleId":       target_id,
            "originalSource": source,
            "mutatedSource":  mutated,
            "diff":           f"-{patch['search']}\n+{patch['replace']}"
        })

    # ── sleeve:commandDiscovered handler (Amendment 3.2) ───────────
    # Receives a discovery proposal from a sleeve. Computes a
    # search/replace patch on the external.commands array and routes
    # it through the existing on_patch_request() pipeline so
    # ProbationOfficer validates the amended source before Registrar
    # writes it. Sleeves cannot self-approve — this is the sole gate.
    def on_command_discovered(self, event):
        module_id         = event.get("moduleId")
        current_commands  = event.get("currentCommands", [])
        undeclared        = event.get("undeclaredCommands", [])
        proposal_id       = event.get("proposalId", "")

        if not module_id or not undeclared:
            return

        # Guard: command names must match the schema constraint
        valid_pattern = __import__("re").compile(r"^[a-zA-Z][a-zA-Z0-9_/.-]*$")
        undeclared = [c for c in undeclared if valid_pattern.match(c)][:10]
        if not undeclared:
            return

        # Build the amended commands array
        amended = sorted(set(current_commands + undeclared))

        # Compute exact search/replace strings as they appear in the source.
        # Handles both JS array literals and JSON arrays.
        old_inline = json.dumps(current_commands)           # ["cmd1","cmd2"]
        new_inline = json.dumps(amended)
        old_json   = json.dumps(current_commands, indent=2) # pretty JSON variant
        new_json   = json.dumps(amended, indent=2)

        # Try compact form first; fall back to pretty form.
        # on_patch_request will reject if neither matches — safe by design.
        patch_variants = [
            {"search": f'"commands": {old_inline}', "replace": f'"commands": {new_inline}'},
            {"search": f'"commands": {old_json}',   "replace": f'"commands": {new_json}'},
        ]

        for patch in patch_variants:
            self.on_patch_request({
                "targetModuleId": module_id,
                "patch":          patch,
                "meta": {
                    "proposalType":       "command-discovery",
                    "proposalId":         proposal_id,
                    "undeclaredCommands": undeclared
                }
            })
            # on_patch_request emits coach:mutationReady on success or
            # coach:patchRejected on failure — stop after first attempt
            # (the second variant is a fallback only if search not found)
            break

    # ── sleeve:modelUpgradeProposed handler (Amendment 4.4) ────────
    # Receives a validated LoRA adapter proposal from a model sleeve.
    # Coach is the sole approval gate — sleeves cannot self-approve.
    # Validates quality score against QUALITY_THRESHOLD; emits
    # coach:modelUpgradeApproved or coach:modelUpgradeRejected.
    QUALITY_THRESHOLD = 0.70

    def on_model_upgrade_proposed(self, event):
        module_id        = event.get("moduleId")
        adapter_id       = event.get("adapterId")
        proposal_id      = event.get("proposalId", "")
        validation_score = event.get("validationScore", 0.0)
        reason           = event.get("proposedReason")

        if not module_id or not adapter_id:
            return

        import datetime
        approved_at = datetime.datetime.utcnow().isoformat() + "Z"

        if validation_score >= self.QUALITY_THRESHOLD:
            self.emit("coach:modelUpgradeApproved", {
                "moduleId":        module_id,
                "adapterId":       adapter_id,
                "proposalId":      proposal_id,
                "approvedAt":      approved_at,
                "validationScore": validation_score
            })
        else:
            self.emit("coach:modelUpgradeRejected", {
                "moduleId":   module_id,
                "adapterId":  adapter_id,
                "proposalId": proposal_id,
                "reason":     f"validationScore {validation_score:.3f} below threshold {self.QUALITY_THRESHOLD} (reason: {reason or 'none'})"
            })
