// Last modified: 2026-06-09 08:45 UTC (index.ts — SDOA v5.0 Task)
import { Registry, SdoaManifest } from '../registrar/Registry.service';
import { LoggerService } from '../../substrate/services/Logger.service';
import { ComparatorsService } from '../../substrate/services/Comparators.service';
import { EvaluatorService } from '../../substrate/services/Evaluator.service';
const TestCoreWorkflow = require('../../substrate/workflows/TestCore.workflow');
import { TestRunnerWorkflow } from '../../substrate/workflows/TestRunner.workflow';
import { AiBrokerAdapter } from '../../substrate/adapters/AiBroker.adapter';
import { VisualOrchestratorService } from '../../substrate/services/VisualOrchestrator.service';
import { DashboardService } from '../../substrate/services/Dashboard.service';
const RegistrarService = require('../registrar/Registrar.service');
import { TestOptions } from '../../substrate/Types';

const MemoryRepository = require('../../substrate/services/Memory.repository');
const MemoryContextBrokerService = require('../../substrate/services/MemoryContextBroker.service');
const MemoryDistillerWorkflow = require('../../substrate/workflows/MemoryDistiller.workflow');
const EventBusService = require('../../substrate/services/EventBus.service');

const OracleService = require('../../substrate/services/Oracle.service');
const ChronicleService = require('../../substrate/services/Chronicle.service');
const ChroniclePersistenceService = require('../../substrate/services/Chronicle.persistence');
const ResponseFormatter = require('../../substrate/services/ResponseFormatter.service');
const AiProviderAdapter = require('../../substrate/adapters/AiProvider.adapter');
const ProbationOfficerWorkflow = require('../../substrate/workflows/ProbationOfficer.workflow');
const AssemblyLineService = require('../../substrate/services/AssemblyLine.service');

export class ConductorTask {
  static MANIFEST: SdoaManifest = {
    id: "index.task",
    type: "task",
    layer: 3,
    runtime: "NodeJS",
    version: "5.0.0",
    operationalRole: "savant",
    requires: [
      "Registry.service", "Logger.service", "Comparators.service", "Evaluator.service",
      "TestCore.workflow", "TestRunner.workflow", "AiBroker.adapter", "VisualOrchestrator.service",
      "Dashboard.service", "Registrar.service", "Memory.repository", "MemoryContextBroker.service",
      "MemoryDistiller.workflow", "EventBus.service", "AssemblyLine.service"
    ],
    capabilities: ["orchestrate_sdoa_tests", "generate_blueprint_schema", "self_healing"],
    dependencies: [
      "Registry.service", "Logger.service", "Comparators.service", "Evaluator.service",
      "TestCore.workflow", "TestRunner.workflow", "AiBroker.adapter", "VisualOrchestrator.service",
      "Dashboard.service", "Registrar.service", "Memory.repository", "MemoryContextBroker.service",
      "MemoryDistiller.workflow", "EventBus.service", "AssemblyLine.service"
    ],
    optimization: {
      priority: "readability",
      assertionSuite: ""
    },
    docs: {
      description: "Main orchestrator task driving SDOA v5 tests, visual blueprint outputs, and AI self-healing.",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };
}

export const MANIFEST = ConductorTask.MANIFEST;

async function main() {
  console.log("🚀 SDOA v5: Initializing System Registry...");
  const registry = new Registry();

  // 1. Register SDOA Services and Workflows
  registry.register(LoggerService);
  registry.register(ComparatorsService);
  registry.register(EvaluatorService);
  registry.register(TestCoreWorkflow);
  registry.register(TestRunnerWorkflow);
  registry.register(AiBrokerAdapter);
  registry.register(VisualOrchestratorService);
  registry.register(DashboardService);
  registry.register(RegistrarService);
  registry.register(MemoryRepository);
  registry.register(MemoryContextBrokerService);
  registry.register(MemoryDistillerWorkflow);
  registry.register(EventBusService);

  registry.register(OracleService);
  registry.register(ChronicleService);
  registry.register(ChroniclePersistenceService);
  registry.register(ResponseFormatter);
  registry.register(AiProviderAdapter);
  registry.register(ProbationOfficerWorkflow);
  registry.register(AssemblyLineService);

  // 2. SDOA v5: Direct WebAssembly In-Memory loading
  console.log("🚀 SDOA v5: Compiling and loading in-memory Wasm solver module...");
  const wasmBinary = Buffer.from([
    0x00, 0x61, 0x73, 0x6d, // magic header: \0asm
    0x01, 0x00, 0x00, 0x00  // WASM binary version: 1
  ]);

  const wasmManifest: SdoaManifest = {
    id: "WasmSolver.engine",
    type: "engine",
    layer: 3,
    runtime: "Wasm",
    version: "5.0.0",
    operationalRole: "savant",
    requires: [],
    optimization: {
      priority: "speed",
      assertionSuite: ""
    },
    docs: {
      description: "Low-level WebAssembly mathematical engine loaded in-memory.",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };

  await registry.registerWasm(wasmManifest, wasmBinary);

  // Initialize SDOA registry modules
  await registry.initAll();

  // 3. SDOA v5: Generate Visual Blueprint schema
  console.log("🚀 SDOA v5: Traversing SDOA Registry to generate Visual Flowchart Blueprint...");
  const orchestrator = registry.get<VisualOrchestratorService>("VisualOrchestrator.service");
  orchestrator.generateBlueprint("blueprint.schema.json");

  // 3.5 SDOA v5: Scan Portfolio and Print SDOAvX Optimization recommendations
  console.log("\n🚀 SDOA v5: Performing Master Portfolio Scan and building registrar roster...");
  const registrar = registry.get<RegistrarService>("Registrar.service");
  await registrar.discoverPortfolio();

  console.log("\n🤖 SDOAvX Roster Fielded Players:");
  for (const [id, player] of registrar.activeRoster.entries()) {
    console.log(`   - ${id}: version ${player.manifest.version} (${player.manifest.runtime})`);
  }
  console.log("");

  // 4. Retrieve TestRunner workflow instance and execute tests
  const runner = registry.get<TestRunnerWorkflow>("TestRunner.workflow");

  runner.setProgressEvent((total, performed, succeeded, failed) => {
    console.log(`Progress: ${performed}/${total}, ${succeeded} passed, ${failed} failed`);
  });

  runner.setChapterEvent((number, name) => {
    console.log(`Chapter ${number}: ${name}`);
  });

  runner.chapter('Mathematical Constants');

  // We set up a mathematical constant test and a failing expression '5 + 3' (expected: 9, evaluator currently returns 8)
  // to trigger SDOA v5 AI Self-Healing loop
  const tests: TestOptions[] = [
    { line: 574, expr: 'e', expected: 2.718281828459045 },
    { line: 575, expr: 'π', expected: 3.141592653589793 },
    { line: 579, expr: 'true', expected: true },
    { line: 500, expr: '5 + 3', expected: 9 } // Will fail, trigger AI self-healing to fix it, hot swap, and succeed!
  ];

  await runner.run(tests);

  // Set up interrupt handlers for clean manual terminal shutdown
  process.on('SIGINT', async () => {
    console.log("\n🛑 SDOA v5: Graceful shutdown initiated via terminal...");
    await registry.disposeAll();
    console.log("🏁 SDOA v5: Disposed all modules successfully.");
    process.exit(0);
  });

  console.log("\n🏁 SDOA v5: All operations completed successfully.");
  console.log("📺 Keeping SDOA Monitor Dashboard server alive.");
  console.log("📺 Click 'Graceful Shutdown' in the UI or press Ctrl+C in the terminal to exit.");
}

main().catch(err => {
  console.error("❌ SDOA v5 Execution Failed:", err);
  process.exit(1);
});
