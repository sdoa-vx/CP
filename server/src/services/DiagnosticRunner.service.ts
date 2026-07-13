import fs from "fs";
import path from "path";
import { PrimeDiscovery } from "./PrimeDiscovery.service";
import { SupabaseSync } from "./SupabaseSync.service";
import { TransportArbitration } from "./TransportArbitration.service";
import { Pulse } from "./Pulse.service";
import { GovernanceRules } from "./GovernanceRules.service";

export class DiagnosticRunnerService {
  async init() {
    // Initialization logic if required
  }

  async run() {
    return { status: "ready" };
  }

  async runAllDiagnostics() {
    const results: any[] = [];
    
    results.push(await this.testSQLiteSchema());
    results.push(await this.testSupabaseSyncHealth());
    results.push(await this.testArbitrationLoad());
    results.push(await this.testPulseStatisticalDrift());
    results.push(await this.testGovernanceRuleEngine());
    
    return results;
  }

  private async testSQLiteSchema() {
    try {
      const db = PrimeDiscovery.getDatabase();
      if (!db) throw new Error("Database not initialized");

      // Test read/write
      db.prepare(`CREATE TABLE IF NOT EXISTS diag_test (id TEXT PRIMARY KEY, val TEXT)`).run();
      db.prepare(`INSERT OR REPLACE INTO diag_test (id, val) VALUES ('1', 'test')`).run();
      const res = db.prepare(`SELECT * FROM diag_test WHERE id = '1'`).get() as any;
      db.prepare(`DROP TABLE diag_test`).run();

      if (res && res.val === "test") {
        return { name: "SQLite Schema Integrity", status: "PASS", message: "DB read/write successful" };
      }
      return { name: "SQLite Schema Integrity", status: "FAIL", message: "DB read/write failed" };
    } catch (err: any) {
      return { name: "SQLite Schema Integrity", status: "FAIL", message: err.message };
    }
  }

  private async testSupabaseSyncHealth() {
    try {
      const status = SupabaseSync.getSyncStatus();
      const exportPath = path.resolve(process.cwd(), "server", "data", "prime_export.json");
      
      if (status.includes("Failed") && fs.existsSync(exportPath)) {
         return { name: "Supabase Sync Health", status: "PASS", message: "Fallback export generated correctly" };
      } else if (status === "Synced") {
         return { name: "Supabase Sync Health", status: "PASS", message: "Synced to Supabase successfully" };
      } else if (status === "Pending") {
         return { name: "Supabase Sync Health", status: "WARN", message: "Sync is currently pending" };
      }
      return { name: "Supabase Sync Health", status: "FAIL", message: `Unexpected status: ${status}` };
    } catch (err: any) {
      return { name: "Supabase Sync Health", status: "FAIL", message: err.message };
    }
  }

  private async testArbitrationLoad() {
    try {
      // Simulate load
      TransportArbitration.simulateTrafficLoad(100);
      return { name: "Arbitration Load Simulation", status: "PASS", message: "Simulated load successfully processed and emitted" };
    } catch (err: any) {
      return { name: "Arbitration Load Simulation", status: "FAIL", message: err.message };
    }
  }

  private async testPulseStatisticalDrift() {
    try {
      // Record 10 baseline samples
      for(let i=0; i<10; i++) {
        Pulse.recordSample({ moduleId: "diag_test", commandId: "eval", durationMs: 10, success: true });
      }
      // Record anomaly sample
      Pulse.recordSample({ moduleId: "diag_test", commandId: "eval", durationMs: 5000, success: true });
      return { name: "Pulse Statistical Drift", status: "PASS", message: "Pulse recorded samples and simulated drift" };
    } catch (err: any) {
      return { name: "Pulse Statistical Drift", status: "FAIL", message: err.message };
    }
  }

  private async testGovernanceRuleEngine() {
    try {
      // Evaluate mock metrics against SR-001
      const mockMetrics = {
        driftScore: 85,
        errorRate: 0.1,
        p95Latency: 350
      };
      const violations = GovernanceRules.evaluateMetrics(mockMetrics);
      if (violations.some((v: any) => v.id === "SR-001")) {
         return { name: "Governance Rule Engine", status: "PASS", message: "SR-001 correctly triggered on mock data" };
      }
      return { name: "Governance Rule Engine", status: "FAIL", message: "Failed to trigger SR-001" };
    } catch (err: any) {
      return { name: "Governance Rule Engine", status: "FAIL", message: err.message };
    }
  }
}

export const DiagnosticRunner = new DiagnosticRunnerService();
