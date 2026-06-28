// ──────────────────────────────────────────────────────────────────
// File:    Logger.service.ts
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// Logger.service.ts — SDOA v5.0 Service
// version: 5.0.0
// Last modified: 2026-06-01 15:25 UTC
// ============================================================

import { TTestItem } from '../Types';
import { SdoaManifest, Registry } from './Registry.service';

export interface LogEntry {
  line: number;
  expr: string;
  expected: any;
  result: any;
  success: boolean;
}

export class LoggerService {
  static MANIFEST: SdoaManifest = {
    id: "Logger.service",
    type: "service",
    layer: 3,
    runtime: "NodeJS",
    version: "5.0.0",
    operationalRole: "savant",
    requires: ["Types"],
    lifecycle: ["init", "dispose"],
    actions: {
      commands: {
        log: { description: "Logs test result", input: { entry: "LogEntry" }, output: "void" },
        updateProgress: { description: "Updates counters and progress logs", input: { success: "boolean" }, output: "void" },
        resetProgress: { description: "Resets all metrics and fail lists", input: {}, output: "void" }
      }
    },
    optimization: {
      priority: "readability",
      assertionSuite: ""
    },
    docs: {
      description: "Service managing testing logs, console outputs, and session statistics.",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };

  public failList: TTestItem[] = [];
  public testCount = 0;
  public successCount = 0;
  public failCount = 0;
  private registry!: Registry;

  async init(registry: Registry): Promise<void> {
    this.registry = registry;
    this.resetProgress();
  }

  log(entry: LogEntry): void {
    const isSuccess = entry.success;
    console.log(
      isSuccess
        ? `Test passed at line ${entry.line}: ${entry.expr}`
        : `Test failed at line ${entry.line}: ${entry.expr}\n  Expected: ${JSON.stringify(entry.expected)}\n  Actual: ${entry.result.toString()}`
    );

    this.registry.broadcast({
      type: 'test-run',
      line: entry.line,
      expr: entry.expr,
      expected: entry.expected,
      result: entry.result.toString(),
      success: isSuccess
    });
  }

  updateProgress(success: boolean): void {
    this.testCount++;
    if (success) {
      this.successCount++;
    } else {
      this.failCount++;
    }
    console.log(`Progress: ${this.testCount} tests, ${this.successCount} passed, ${this.failCount} failed`);

    this.registry.broadcast({
      type: 'progress-update',
      total: 1496146,
      performed: this.testCount,
      succeeded: this.successCount,
      failed: this.failCount
    });
  }

  resetProgress(): void {
    this.testCount = 0;
    this.successCount = 0;
    this.failCount = 0;
    this.failList.length = 0;
  }

  async dispose(): Promise<void> {
    // Final cleanup of log streams if any
  }
}
