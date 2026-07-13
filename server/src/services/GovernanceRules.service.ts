import { Chronicle } from "./Chronicle.service";

export interface SdoaRule {
  id: string;
  name: string;
  description: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  type: "metric" | "composite" | "temporal";
  evaluate?: (metrics: any) => boolean;
}

export class GovernanceRulesService {
  private _rules = new Map<string, SdoaRule>();

  async init() {
    this._rules.set("SR-001", { id: "SR-001", name: "Drift Tolerance Exceeded", description: "Module drift score exceeds acceptable operational limits.", severity: "High", type: "metric", evaluate: (m) => m.driftScore > 80 });
    this._rules.set("SR-002", { id: "SR-002", name: "Latency Spike", description: "Module response time exceeds operational SLA.", severity: "Medium", type: "metric", evaluate: (m) => m.p95Latency > 200 });
    this._rules.set("SR-003", { id: "SR-003", name: "High Error Rate", description: "Error rate > 5%", severity: "High", type: "metric", evaluate: (m) => m.errorRate > 5 });
    this._rules.set("SR-004", { id: "SR-004", name: "Resource Exhaustion", description: "Memory or CPU exceeds bounds", severity: "High", type: "metric", evaluate: (m) => m.cpuUsage > 90 || m.memUsage > 90 });
    this._rules.set("SR-005", { id: "SR-005", name: "Network Partition", description: "Sleeve unresponsive", severity: "Critical", type: "metric", evaluate: (m) => m.isUnresponsive });
    this._rules.set("SR-006", { id: "SR-006", name: "Data Stale", description: "Cache data is stale", severity: "Low", type: "metric" });
    this._rules.set("SR-007", { id: "SR-007", name: "Concurrency Limit", description: "Too many concurrent requests", severity: "Medium", type: "metric" });
    this._rules.set("SR-008", { id: "SR-008", name: "Orphaned Sleeve", description: "Sleeve active but not routed", severity: "Low", type: "metric" });
    this._rules.set("SR-009", { id: "SR-009", name: "Unauthorized Access", description: "Sleeve accessed restricted subsystem", severity: "Critical", type: "metric" });
    this._rules.set("SR-010", { id: "SR-010", name: "Version Skew", description: "Sleeve version incompatible with core", severity: "High", type: "metric" });
    this._rules.set("SR-011", { id: "SR-011", name: "Configuration Drift", description: "Sleeve config differs from expected", severity: "Medium", type: "metric" });
    this._rules.set("SR-012", { id: "SR-012", name: "Event Loop Blocked", description: "Event loop lag > 100ms", severity: "High", type: "metric" });
    this._rules.set("SR-013", { id: "SR-013", name: "Uncaught Exception", description: "Process crashed due to uncaught exception", severity: "Critical", type: "metric" });
    this._rules.set("SR-014", { id: "SR-014", name: "Critical Anomaly Detected", description: "Pulse telemetry indicates a critical failure state.", severity: "Critical", type: "metric" });
    
    // Composite Rules
    this._rules.set("SR-015", { 
      id: "SR-015", name: "Cascading Failure Risk", description: "High Drift AND High Error Rate", severity: "Critical", type: "composite",
      evaluate: (m) => this._rules.get("SR-001")!.evaluate!(m) && this._rules.get("SR-003")!.evaluate!(m)
    });
    
    this._rules.set("SR-016", { id: "SR-016", name: "Severe Load", description: "Concurrency + Latency", severity: "High", type: "composite" });
    this._rules.set("SR-017", { id: "SR-017", name: "Security Breach", description: "Unauthorized + Skew", severity: "Critical", type: "composite" });
    
    // Temporal Rules
    this._rules.set("SR-018", { id: "SR-018", name: "Persistent Latency", description: "Latency > 200ms for 5 minutes", severity: "High", type: "temporal" });
    this._rules.set("SR-019", { id: "SR-019", name: "Flapping Route", description: "Route changed 3 times in 1 min", severity: "Medium", type: "temporal" });
    this._rules.set("SR-020", { id: "SR-020", name: "Chronic Crashes", description: "Crashed 3 times in 1 hour", severity: "Critical", type: "temporal" });

    // Probation Governance Rules
    this._rules.set("SR-021", { id: "SR-021", name: "Line Limit Exceeded", description: "Generated module exceeds the hard limit of 500 lines.", severity: "Critical", type: "metric" });
    this._rules.set("SR-022", { id: "SR-022", name: "AI Governance Audit Failed", description: "Module failed the strict AI Code Review for SDOA compliance.", severity: "High", type: "composite" });

    // Filesystem Governance Rules
    this._rules.set("SR-023", { 
      id: "SR-023", name: "Manual Authority Edit", description: "Manual edit detected in critical authority directory.", severity: "High", type: "metric",
      evaluate: (m) => m.event === "filesystem:change" && m.source === "Manual Edit" && (m.file?.startsWith('server/src/services') || m.file?.startsWith('server/src/engine') || m.file?.startsWith('server/src/routes/lifecycle'))
    });

    this._rules.set("SR-024", {
      id: "SR-024", name: "Rapid Mutation Burst", description: "Unusual burst of manual edits detected.", severity: "Medium", type: "temporal"
    });

    this._rules.set("SR-025", {
      id: "SR-025", name: "Unauthorized Deletion", description: "Deletion of sovereign component detected.", severity: "Critical", type: "metric",
      evaluate: (m) => m.event === "filesystem:change" && m.action === "deleted" && (m.file?.endsWith('.service.ts') || m.file?.endsWith('.workflow.ts') || m.file?.endsWith('.manifest.json'))
    });

    this._rules.set("SR-026", {
      id: "SR-026", name: "Structural Drift", description: "Large structural change detected in service module.", severity: "Medium", type: "metric",
      evaluate: (m) => m.event === "filesystem:change" && m.action === "change" && m.file?.startsWith('server/src/services/') && m.prevSizeBytes > 0 && Math.abs(m.sizeBytes - m.prevSizeBytes) / m.prevSizeBytes > 0.3
    });

    this._rules.set("SR-027", {
      id: "SR-027", name: "Editor Mismatch", description: "Code modified by unknown editor.", severity: "Low", type: "metric",
      evaluate: (m) => m.event === "filesystem:change" && m.action === "change" && m.source === "Manual Edit" && (m.file?.endsWith('.ts') || m.file?.endsWith('.js'))
    });
  }

  async run() { return { status: "ready", rulesCount: this._rules.size }; }
  async dispose() {}

  getRules() {
    return Array.from(this._rules.values());
  }

  getRule(id: string) {
    return this._rules.get(id);
  }

  evaluateMetrics(metrics: any) {
    const violations: SdoaRule[] = [];
    for (const rule of this._rules.values()) {
      if (rule.evaluate && rule.evaluate(metrics)) {
        violations.push(rule);
      }
    }
    return violations;
  }
}

export const GovernanceRules = new GovernanceRulesService();
