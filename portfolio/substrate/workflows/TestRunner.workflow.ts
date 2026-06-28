// ──────────────────────────────────────────────────────────────────
// File:    TestRunner.workflow.ts
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// TestRunner.workflow.ts — SDOA v5.0 Workflow
// version: 5.0.0
// Last modified: 2026-06-01 15:25 UTC
// ============================================================

import { SdoaManifest, Registry } from '../services/Registry.service';
import { TestCoreWorkflow } from './TestCore.workflow';
import { LoggerService } from '../services/Logger.service';
import { TestOptions } from '../Types';

export interface ChapterEvent {
  (chapterNumber: number, chapterName: string): void;
}

export interface ProgressEvent {
  (total: number, performed: number, succeeded: number, failed: number): void;
}

export class TestRunnerWorkflow {
  static MANIFEST: SdoaManifest = {
    id: "TestRunner.workflow",
    type: "workflow",
    layer: 3,
    runtime: "NodeJS",
    version: "5.0.0",
    operationalRole: "savant",
    requires: ["TestCore.workflow", "Logger.service"],
    lifecycle: ["init", "run", "dispose"],
    actions: {
      commands: {
        run: {
          description: "Runs the complete batch of test options",
          input: { tests: "TestOptions[]" },
          output: "void"
        },
        chapter: {
          description: "Defines and prints chapter demarcations",
          input: { name: "string" },
          output: "void"
        }
      }
    },
    optimization: {
      priority: "readability",
      assertionSuite: ""
    },
    docs: {
      description: "Workflow directing test sequencing and tracking progress stats.",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };

  private testCore!: TestCoreWorkflow;
  private logger!: LoggerService;
  private chapterNumber = 0;
  private progressEvent?: ProgressEvent;
  private chapterEvent?: ChapterEvent;
  private totalCount = 1_496_146;

  async init(registry: Registry): Promise<void> {
    this.testCore = registry.get<TestCoreWorkflow>("TestCore.workflow");
    this.logger = registry.get<LoggerService>("Logger.service");
    this.chapterNumber = 0;
  }

  setProgressEvent(event: ProgressEvent): void {
    this.progressEvent = event;
  }

  setChapterEvent(event: ChapterEvent): void {
    this.chapterEvent = event;
  }

  chapter(name: string): void {
    this.chapterNumber++;
    this.chapterEvent?.(this.chapterNumber, name);
  }

  async run(tests: TestOptions[]): Promise<void> {
    this.logger.resetProgress();
    for (const testCase of tests) {
      await this.testCore.run(testCase);
      this.progressEvent?.(
        this.totalCount,
        this.logger.testCount,
        this.logger.successCount,
        this.logger.failCount
      );
    }
  }

  async dispose(): Promise<void> {
    // Cleanup runner state
  }
}
