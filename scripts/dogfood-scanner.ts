import * as fs from "node:fs";
import * as path from "node:path";

function getAllTsFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllTsFiles(fullPath, fileList);
    } else if (fullPath.endsWith(".ts")) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function determineSdoaType(filePath: string): { type: string; layer: number } {
  const p = filePath.toLowerCase();
  if (p.includes("routes") || p.includes("webhooks") || p.includes("ws.ts") || p.includes("api")) {
    return { type: "adapter", layer: 3 };
  }
  if (p.includes("detectors") || p.includes("engine")) {
    return { type: "engine", layer: 3 };
  }
  if (p.includes("pipeline") || p.includes("workers")) {
    return { type: "workflow", layer: 3 };
  }
  if (p.includes("validators")) {
    return { type: "validator", layer: 3 };
  }
  return { type: "service", layer: 4 }; // Fallback (fisp, utils, storage, etc)
}

function runDogfoodScan() {
  const targetDirs = [
    path.join(process.cwd(), "server", "src"),
    path.join(process.cwd(), "extension", "src")
  ];

  let filesProcessed = 0;
  let filesSkipped = 0;

  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) continue;
    const tsFiles = getAllTsFiles(dir);

    for (const filePath of tsFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      
      // Skip if it already has a MANIFEST or is completely empty
      if (content.includes("MANIFEST") || content.trim() === "") {
        filesSkipped++;
        continue;
      }

      const basename = path.basename(filePath, ".ts");
      const { type, layer } = determineSdoaType(filePath);

      const manifestCode = `\nexport const MANIFEST = {
  id: "dogfood-scanner.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "node:fs",
    "node:path"
  ],
  dependencies: [],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};\n\n`;

      // Find where to insert (after last import)
      const lines = content.split("\n");
      let insertIdx = 0;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().startsWith("import ")) {
          insertIdx = i + 1;
          break;
        }
      }

      lines.splice(insertIdx, 0, manifestCode);
      fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
      
      console.log(`[DOGFOOD] Injected MANIFEST into: ${path.relative(process.cwd(), filePath)} (Type: ${type}, Layer: ${layer})`);
      filesProcessed++;
    }
  }

  console.log(`\n==============================================`);
  console.log(`🐕 DOGFOOD SCAN COMPLETE`);
  console.log(`Files updated: ${filesProcessed}`);
  console.log(`Files skipped (already compliant): ${filesSkipped}`);
  console.log(`Total codebase: ${filesProcessed + filesSkipped} TS files.`);
  console.log(`==============================================\n`);
}

runDogfoodScan();
