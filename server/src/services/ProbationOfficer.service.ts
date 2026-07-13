import { Chronicle } from "./Chronicle.service";
import { GovernanceRules, SdoaRule } from "./GovernanceRules.service";
import { emit, subscribe, unsubscribe } from "../engine/events";
import fs from "fs";
import { PrimeDiscovery } from "./PrimeDiscovery.service";
import { AiProviderManager } from "./AiProviderManager.service";

export interface GovernanceViolation {
  id: string;
  moduleId: string;
  sleeveId?: string;
  ruleId: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  description: string;
  timestamp: string;
  resolved: boolean;
}

export interface GovernanceDecision {
  id: string;
  violationId: string;
  action: "Approve" | "Reject" | "Rebuild" | "Quarantine";
  reason: string;
  timestamp: string;
}

export class ProbationOfficerService {
  private _violations = new Map<string, GovernanceViolation>();
  private _decisions = new Map<string, GovernanceDecision>();
  private _busUnsub: Array<() => void> = [];

  async init() {
    this._subscribeEvents();
  }

  async run() { return { status: "ready", activeViolations: this._violations.size }; }
  
  async dispose() {
    this._unsubscribeEvents();
  }

  getViolations() {
    return Array.from(this._violations.values());
  }

  getDecisions() {
    return Array.from(this._decisions.values());
  }

  recordViolation(moduleId: string, ruleId: string, sleeveId?: string, customDescription?: string) {
    const rule = GovernanceRules.getRule(ruleId);
    if (!rule) return null;

    const violation: GovernanceViolation = {
      id: `vio_${Date.now()}_${Math.floor(Math.random()*1000)}`,
      moduleId,
      sleeveId,
      ruleId,
      severity: rule.severity,
      description: customDescription || rule.description,
      timestamp: new Date().toISOString(),
      resolved: false
    };

    this._violations.set(violation.id, violation);
    Chronicle.recordEvent("governance:violation_detected", violation, "ProbationOfficer");
    this._emit("governance:violation_detected", violation);
    return violation;
  }

  makeDecision(violationId: string, action: "Approve" | "Reject" | "Rebuild" | "Quarantine", reason: string) {
    const violation = this._violations.get(violationId);
    if (!violation) throw new Error("Violation not found");

    const decision: GovernanceDecision = {
      id: `dec_${Date.now()}_${Math.floor(Math.random()*1000)}`,
      violationId,
      action,
      reason,
      timestamp: new Date().toISOString()
    };

    this._decisions.set(decision.id, decision);
    violation.resolved = action !== "Quarantine" && action !== "Reject";

    Chronicle.recordEvent("governance:decision_made", decision, "ProbationOfficer");
    this._emit("governance:decision_made", decision);

    return decision;
  }

  resolveViolation(violationId: string) {
    const violation = this._violations.get(violationId);
    if (!violation) return false;
    
    violation.resolved = true;
    Chronicle.recordEvent("governance:violation_resolved", { violationId }, "ProbationOfficer");
    return true;
  }

  private _subscribeEvents() {
    // Probation officer monitors Pulse anomalies to automatically flag violations
    const onPulseAnomaly = (payload: any) => {
      const { moduleId, severity } = payload;
      if (severity === "high") {
        this.recordViolation(moduleId, "SR-014"); // Critical anomaly
      } else {
        this.recordViolation(moduleId, "SR-001"); // Drift exceeded
      }
    };

    const onInnovationSynthesized = async (payload: any) => {
      const { candidateId, generatedModulePath } = payload;
      try {
        if (!fs.existsSync(generatedModulePath)) {
          throw new Error("Generated module file not found.");
        }
        
        const content = fs.readFileSync(generatedModulePath, "utf-8");
        
        // 1. Static Audit: Line-Limit Rule (SR-021)
        const lineCount = content.split('\n').length;
        if (lineCount > 500) {
          this.recordViolation("NEW_MODULE", "SR-021", undefined, `Generated module is ${lineCount} lines, exceeding the 500-line hard limit.`);
          throw new Error(`SDOA Rule 5.2 Violation: Line Limit Exceeded (${lineCount} > 500)`);
        }

        // 2. Static Audit: Basic Manifest existence
        if (!content.includes("MANIFEST = {")) {
           throw new Error("Missing SDOA MANIFEST export.");
        }
        
        // 3. AI-Assisted Deep Governance Audit (SR-022)
        const prompt = `
You are the strict SDOA Governance Rule Engine.
Audit the following synthesized module code against the SDOA Governance Outline.

Check for:
1. Manifest Completeness: Must contain all v1.2, v4.0, and v5.0 fields (id, type, version, runtime, capabilities, dependencies/requires, docs, last_modified, layer, operationalRole, etc.).
2. Lifecycle Contracts: If frontend, it must have init, mount, update, unmount, destroy. If backend, init, run, dispose.
3. Sovereignty: No direct cross-module mutations.

Code to audit:
\`\`\`typescript
${content.slice(0, 3000)} // Snippet for token limits
\`\`\`

If the code violates ANY SDOA governance rules, reply exactly with:
REJECTED: [List the specific rule violations here]

If the code is fully compliant, reply exactly with:
APPROVED
        `;

        const aiResponse = await AiProviderManager.generate(prompt);
        if (aiResponse.includes("REJECTED")) {
          this.recordViolation("NEW_MODULE", "SR-022", undefined, `AI Audit Failed: ${aiResponse.replace("REJECTED:", "").trim()}`);
          throw new Error(`SDOA AI Governance Audit Failed: ${aiResponse}`);
        }
        
        // Pass validation
        PrimeDiscovery.updateCandidateStatus(candidateId, 'validated');
        Chronicle.recordEvent("probation:passed", { candidateId, generatedModulePath }, "ProbationOfficer");
        this._emit("innovation:validated", { candidateId, generatedModulePath });
        
      } catch (err: any) {
        PrimeDiscovery.updateCandidateStatus(candidateId, 'failed', undefined, undefined, err.message);
        Chronicle.recordEvent("probation:failed", { candidateId, error: err.message }, "ProbationOfficer");
        this._emit("innovation:failed", { candidateId, error: err.message });
      }
    };

    subscribe("pulse:anomalyDetected", onPulseAnomaly);
    subscribe("innovation:synthesized", onInnovationSynthesized);
    
    this._busUnsub.push(
      () => unsubscribe("pulse:anomalyDetected", onPulseAnomaly),
      () => unsubscribe("innovation:synthesized", onInnovationSynthesized)
    );
  }

  private _unsubscribeEvents() {
    this._busUnsub.forEach(fn => fn());
    this._busUnsub = [];
  }

  private _emit(name: string, payload: any) {
    emit(name, payload);
  }
}

export const ProbationOfficer = new ProbationOfficerService();
