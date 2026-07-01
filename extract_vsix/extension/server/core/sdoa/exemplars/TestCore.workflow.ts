// ──────────────────────────────────────────────────────────────────
// File:    TestCore.workflow.ts
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// TestCore.workflow.ts — SDOA v5.0 Workflow
// version: 5.0.0
// Last modified: 2026-06-01 14:55 UTC
// ============================================================

import { TAlgosimObject, TestOptions } from '../Types';
import { SdoaManifest, Registry } from '../services/Registry.service';
import { EvaluatorService } from '../services/Evaluator.service';
import { ComparatorsService } from '../services/Comparators.service';
import { LoggerService } from '../services/Logger.service';
import { AiBrokerAdapter } from '../adapters/AiBroker.adapter';

export class TestCoreWorkflow {
  static MANIFEST: SdoaManifest = {
    id: "TestCore.workflow",
    type: "workflow",
    layer: 3,
    runtime: "NodeJS",
    version: "5.0.0",
    operationalRole: "savant",
    requires: ["Evaluator.service", "Comparators.service", "Logger.service", "AiBroker.adapter"],
    lifecycle: ["init", "run", "dispose"],
    actions: {
      commands: {
        run: {
          description: "Runs a single test case evaluation and assertions, invoking AI self-healing on failure",
          input: { options: "TestOptions" },
          output: "void"
        }
      }
    },
    optimization: {
      priority: "readability",
      assertionSuite: ""
    },
    docs: {
      description: "Workflow verifying single expression calculation matches expectations with self-healing feedback loop.",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };

  private evaluator!: EvaluatorService;
  private comparators!: ComparatorsService;
  private logger!: LoggerService;
  private aiBroker!: AiBrokerAdapter;

  async init(registry: Registry): Promise<void> {
    this.evaluator = registry.get<EvaluatorService>("Evaluator.service");
    this.comparators = registry.get<ComparatorsService>("Comparators.service");
    this.logger = registry.get<LoggerService>("Logger.service");
    this.aiBroker = registry.get<AiBrokerAdapter>("AiBroker.adapter");
  }

  private getComparator(expected: any): (result: TAlgosimObject, expected: any, testSL: boolean, sl: string) => boolean {
    if (expected === null) return () => true;
    if (Array.isArray(expected)) return this.comparators.compareArray.bind(this.comparators);
    if (typeof expected === 'string') return this.comparators.compareString.bind(this.comparators);
    if (typeof expected === 'number') return this.comparators.compareNumber.bind(this.comparators);
    if (typeof expected === 'boolean') return this.comparators.compareBoolean.bind(this.comparators);
    if (expected?.type === 'rgb') return this.comparators.compareRGB.bind(this.comparators);
    if (expected?.type === 'hsv') return this.comparators.compareHSV.bind(this.comparators);
    if (expected?.type === 'hsl') return this.comparators.compareHSL.bind(this.comparators);
    if (expected?.type === 'signal') return this.comparators.compareSignal.bind(this.comparators);
    if (expected?.type === 'rational') return this.comparators.compareRational.bind(this.comparators);
    return () => false;
  }

  async run(options: TestOptions): Promise<void> {
    const { line, expr, expected, testSL = false, sl = '' } = options;
    try {
      let result = this.evaluator.evaluate(expr);
      let success = this.getComparator(expected)(result, expected, testSL, sl);

      if (!success) {
        const healed = await this.aiBroker.healTestFailure(expr, expected, result.value);
        if (healed) {
          result = this.evaluator.evaluate(expr);
          success = this.getComparator(expected)(result, expected, testSL, sl);
        }
      }

      this.logger.log({ line, expr, expected, result, success });
      this.logger.updateProgress(success);

      if (!success) {
        this.logger.failList.push({
          line,
          expr,
          expected: JSON.stringify(expected),
          actual: result.toString(),
          toString: () => `Test failed at line ${line}:\n  Expr: ${expr}\n  Expected: ${expected}\n  Actual: ${result.toString()}`,
        });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      const healed = await this.aiBroker.healTestFailure(expr, expected, errMsg);
      if (healed) {
        try {
          const result = this.evaluator.evaluate(expr);
          const success = this.getComparator(expected)(result, expected, testSL, sl);
          this.logger.log({ line, expr, expected, result, success });
          this.logger.updateProgress(success);
          return;
        } catch (retryError) {
          // Fall through if retry still fails
        }
      }

      this.logger.failList.push({
        line,
        expr,
        expected: JSON.stringify(expected),
        actual: errMsg,
        toString: () => `Test failed at line ${line}:\n  Expr: ${expr}\n  Expected: ${expected}\n  Actual: ${errMsg}`,
      });
      this.logger.log({ line, expr, expected, result: { type: 'error', value: errMsg } as any, success: false });
      this.logger.updateProgress(false);
    }
  }

  async dispose(): Promise<void> {
    // Cleanup logic
  }
}
