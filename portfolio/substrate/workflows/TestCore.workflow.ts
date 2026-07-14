// ──────────────────────────────────────────────────────────────────
// File:    TestCore.workflow.ts
// Version: 5.1.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Step 13 — Coach is now the sole healing path.
//          AiBrokerAdapter removed; replaced with AiSleeve.module.
//          AiSleeve.healTestFailure() emits heal:patch-request into
//          the registry pipeline (Coach → ProbationOfficer → Registrar)
//          rather than directly mutating source or live instances.
// ──────────────────────────────────────────────────────────────────
// ============================================================
// AlgosimTest.workflow.ts — SDOA v5.1 Workflow
// version: 5.1.0
// Last modified: 2026-06-27
// ============================================================

import { TAlgosimObject, TestOptions } from '../Types';
import { SdoaManifest, Registry } from '../services/Registry.service';
import { EvaluatorService } from '../services/Evaluator.service';
import { ComparatorsService } from '../services/Comparators.service';
import { LoggerService } from '../services/Logger.service';
import { AiSleeve } from '../adapters/AiSleeve.module';

export class AlgosimTestWorkflow {
  static MANIFEST: SdoaManifest = {
    id: "AlgosimTest.workflow",
    type: "workflow",
    layer: 3,
    runtime: "NodeJS",
    version: "5.1.1",
    last_modified: "2026-07-13T00:00:00Z",
    operationalRole: "savant",
    capabilities: ["algosim:run-test", "algosim:self-heal"],
    // AiBroker.adapter replaced by AiSleeve.module (Step 13)
    requires: ["Evaluator.service", "Comparators.service", "Logger.service", "AiSleeve.module"],
    dependencies: ["Evaluator.service", "Comparators.service", "Logger.service", "AiSleeve.module"],
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
  private aiSleeve!: AiSleeve;

  async init(registry: Registry): Promise<void> {
    this.evaluator  = registry.get<EvaluatorService>("Evaluator.service");
    this.comparators = registry.get<ComparatorsService>("Comparators.service");
    this.logger     = registry.get<LoggerService>("Logger.service");
    this.aiSleeve   = registry.get<AiSleeve>("AiSleeve.module");
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
        const healed = await this.aiSleeve.healTestFailure(expr, expected, result.value);
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

      const healed = await this.aiSleeve.healTestFailure(expr, expected, errMsg);
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
