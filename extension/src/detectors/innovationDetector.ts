import * as vscode from "vscode";
import { globalAstEngine } from "./astClusteringEngine";
import { UIPrimitiveDetector } from "./subdetectors/uiPrimitiveDetector";
import { WorkflowDetector } from "./subdetectors/workflowDetector";
import { SchemaDetector } from "./subdetectors/schemaDetector";
import { TokenDetector } from "./subdetectors/tokenDetector";
import { EngineDetector } from "./subdetectors/engineDetector";

const uiDetector = new UIPrimitiveDetector();
const workflowDetector = new WorkflowDetector();
const schemaDetector = new SchemaDetector();
const tokenDetector = new TokenDetector();
const engineDetector = new EngineDetector();

export async function detectInnovation(doc: vscode.TextDocument): Promise<any | null> {
  // Update incremental AST cache for the file that was just changed
  globalAstEngine.cacheFile(doc.uri.fsPath);

  const cache = globalAstEngine.getCache();

  // Run the 5 sub-detectors
  const newPrimitives = uiDetector.run(cache);
  const newWorkflows = workflowDetector.run(cache);
  const newSchemas = schemaDetector.run(cache);
  const newTokens = tokenDetector.run(cache);
  const newEngines = engineDetector.run(cache);

  // If nothing meets the thresholds, return null
  if (
    newPrimitives.length === 0 &&
    newWorkflows.length === 0 &&
    newSchemas.length === 0 &&
    newTokens.length === 0 &&
    newEngines.length === 0
  ) {
    return null;
  }

  // Construct the innovation.json ledger exactly as specified
  const ledger = {
    newPrimitives,
    newWorkflows,
    newSchemas,
    newTokens,
    newEngines
  };

  const firstFind: any = newPrimitives[0] || newWorkflows[0] || newSchemas[0] || newEngines[0] || newTokens[0];
  const name = firstFind.id || firstFind.name || "System Extraction";
  const type = firstFind.type || "token";

  return {
    type,
    name,
    version: "1.0.0",
    source: {
      language: "json",
      content: JSON.stringify(ledger, null, 2),
      path: doc.uri.fsPath
    },
    sdoa: {
      layer: firstFind.layer || 2,
      placement: "application",
      manifest: {
        operationalRole: "detected-innovation",
        optimization: { priority: "high" }
      }
    },
    metrics: { usageCount: 0, projectsObserved: 1, confidence: 0.95 },
    fullLedger: ledger
  };
}
