import "dotenv/config";
import { DiagnosticRunner } from "./server/src/services/DiagnosticRunner.service";
import { PrimeDiscovery } from "./server/src/services/PrimeDiscovery.service";
import { SupabaseSync } from "./server/src/services/SupabaseSync.service";

async function verify() {
  console.log("Starting AI Verification Simulation...");
  
  // Initialize services
  await PrimeDiscovery.init();
  await SupabaseSync.init();
  await DiagnosticRunner.init();

  // 1. Trigger Prime Scan
  console.log("Triggering Prime Scan...");
  await PrimeDiscovery.scanWorkspace(process.cwd());

  // 2. Run Diagnostics
  console.log("Running Diagnostic Runner Suites...");
  const results = await DiagnosticRunner.runAllDiagnostics();
  
  console.log(JSON.stringify(results, null, 2));

  console.log("Verification Complete!");
  process.exit(0);
}

verify().catch(console.error);
