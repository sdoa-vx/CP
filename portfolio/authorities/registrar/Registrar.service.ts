// ──────────────────────────────────────────────────────────────────
// File:    Registrar.service.ts  (logical id: Curator.service)
// Version: 5.1.0
// Updated: 2026-06-27T00:00:00Z
// Changes: V6 compliance — watchPath replaced with PathResolver-based
//          derivation from process.env.PROTOAI_PORTFOLIO_ROOT or cwd().
//          Stale "C:\\Projects\\SDOAvX" hardcode removed.
// ──────────────────────────────────────────────────────────────────

import { SdoaManifest, Registry } from './Registry.service';
import * as fs from 'fs';
import * as path from 'path';

export class CuratorService {
  static MANIFEST: SdoaManifest = {
    id: "Curator.service",
    type: "service",
    layer: 3,
    runtime: "NodeJS",
    version: "5.1.0",
    operationalRole: "savant",
    requires: ["Registry.service"],
    lifecycle: ["init"],
    actions: {
      commands: {
        scan: { description: "Scan the portfolio and build master.manifest.json", input: {}, output: "void" },
        catalog: { description: "Get the current list of cataloged modules", input: {}, output: "any[]" },
        recommend: { description: "Generate SDOA optimization suggestions", input: {}, output: "string[]" },
        describe: { description: "Describe a module's capabilities and commands", input: { id: "string" }, output: "string" }
      }
    },
    optimization: {
      priority: "readability",
      assertionSuite: ""
    },
    docs: {
      description: "Catalog builder: scans the portfolio, parses manifests, resolves collisions, and writes master.manifest.json. (The live portfolio governor is Registrar.service, the .js v5.1.0.)",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };

  private registry!: Registry;
  // V6: watchPath resolved from env var, falling back to the canonical
  //     portfolio directory relative to process.cwd(). Never hardcoded.
  private watchPath = process.env.PROTOAI_PORTFOLIO_ROOT
    ?? path.resolve(process.cwd(), "portfolio");
  private modulesMap = new Map<string, { manifest: SdoaManifest; path: string }>();

  async init(registry: Registry): Promise<void> {
    this.registry = registry;
    console.log(`🌀 SDOA v5: Registrar Service Initialized. Monitoring portfolio at: ${this.watchPath}`);

    // Automatically perform initial scan
    try {
      this.scan();
    } catch (err) {
      console.error("⚠️ Registrar Service: Initial scan failed:", err);
    }
  }

  scan(): void {
    console.log(`🔍 SDOA Registrar: Scanning portfolio for SDOAvX manifests...`);
    if (!fs.existsSync(this.watchPath)) {
      console.log(`⚠️ SDOA Registrar: Watch path does not exist: ${this.watchPath}`);
      return;
    }

    this.modulesMap.clear();
    const files = this.findFilesRecursively(this.watchPath);
    console.log(`🔍 SDOA Registrar: Discovered ${files.length} source code files. Parsing manifests...`);

    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (!['.js', '.ts', '.tsx', '.py', '.rs', '.cbl', '.bas', '.css', '.html'].includes(ext)) {
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const manifest = this.parseManifest(content, filePath);
        if (manifest) {
          const existing = this.modulesMap.get(manifest.id);
          if (existing) {
            // Collision detected! Solve using SDOA v5 arbitration rules
            const chosen = this.resolveCollision(manifest, existing.manifest);
            if (chosen === manifest) {
              console.log(`🌀 SDOA Registrar: Naming Collision solved! Prioritizing ${filePath} for ID '${manifest.id}'`);
              this.modulesMap.set(manifest.id, { manifest, path: filePath });
            } else {
              console.log(`🌀 SDOA Registrar: Naming Collision solved! Keeping current registration for ID '${manifest.id}'`);
            }
          } else {
            this.modulesMap.set(manifest.id, { manifest, path: filePath });
          }
        }
      } catch (err) {
        // Skip unreadable files
      }
    }

    // Generate and write master.manifest.json to disk
    this.writeMasterManifest();
  }

  catalog(): any[] {
    const list: any[] = [];
    for (const [id, value] of this.modulesMap.entries()) {
      list.push({
        id,
        path: value.path.replace(this.watchPath, ''),
        manifest: value.manifest
      });
    }
    return list;
  }

  recommend(): string[] {
    const recommendations: string[] = [];
    console.log(`🤖 SDOA Registrar: Evaluating portfolio for structural optimization recommendations...`);

    for (const [id, val] of this.modulesMap.entries()) {
      const manifest = val.manifest;

      // 1. Check for monolithic growth (Anti-pattern 3)
      try {
        const stats = fs.statSync(val.path);
        const content = fs.readFileSync(val.path, 'utf-8');
        const linesCount = content.split('\n').length;

        if (manifest.type === 'primitive' && linesCount > 150) {
          recommendations.push(`⚠️ [Anti-Pattern] Primitive '${id}' has crossed 150 lines limit (${linesCount} lines). Recommend decomposing into sub-primitives.`);
        }
        if (manifest.type === 'workflow' && linesCount > 200) {
          recommendations.push(`⚠️ [Anti-Pattern] Workflow '${id}' has crossed 200 lines limit (${linesCount} lines). Recommend decomposing into feature sub-steps.`);
        }
      } catch (_) {}

      // 2. Recommend Wasm migration for JS engines
      if (manifest.type === 'engine' && manifest.runtime === 'NodeJS') {
        recommendations.push(`💡 [Performance Upgrade] Engine '${id}' is currently running on NodeJS. Recommend compiling core math solvers to WebAssembly (Wasm) for direct V8 shared memory optimization.`);
      }

      // 3. Recommend defensive Sandboxing for AI Mutations
      if (manifest.operationalRole === 'coach' && manifest.runtime === 'NodeJS') {
        recommendations.push(`💡 [Security Enforcement] Coach module '${id}' is running on NodeJS. Recommend binding a Rust-based ProbationOfficer validation wrapper to sandbox code mutations.`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push("✅ No anti-patterns detected. SDOAvX portfolio is fully optimized!");
    }

    return recommendations;
  }

  describe(id: string): string {
    const entry = this.modulesMap.get(id);
    if (!entry) return `Module '${id}' is not cataloged in the portfolio.`;

    const m = entry.manifest;
    const commands = m.actions?.commands ? Object.keys(m.actions.commands).join(', ') : 'none';
    const requires = m.requires ? m.requires.join(', ') : 'none';

    return `
=== SDOAvX Module Specification ===
ID:          ${m.id}
Type:        ${m.type}
Version:     ${m.version}
Role:        ${m.operationalRole || 'savant'}
Runtime:     ${m.runtime}
Priority:    ${m.optimization?.priority || 'readability'}
Commands:    ${commands}
Requires:    ${requires}
Description: ${m.docs?.description || 'No description provided.'}
Location:    ${entry.path}
==================================
`;
  }

  private findFilesRecursively(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'target') {
        continue;
      }
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(this.findFilesRecursively(filePath));
      } else {
        results.push(filePath);
      }
    }
    return results;
  }

  private parseManifest(content: string, filePath: string): SdoaManifest | null {
    // 1. Try to find JSON-style manifestation in TS/JS files
    const manifestMatch = content.match(/MANIFEST\s*(?::\s*SdoaManifest)?\s*=\s*\{([\s\S]*?)\};/);
    if (manifestMatch) {
      try {
        const block = manifestMatch[1];
        const id = this.extractRegex(block, /id:\s*["']([^"']+)["']/);
        const type = this.extractRegex(block, /type:\s*["']([^"']+)["']/) as any;
        const version = this.extractRegex(block, /version:\s*["']([^"']+)["']/);
        const runtime = this.extractRegex(block, /runtime:\s*["']([^"']+)["']/) as any;
        const layerStr = this.extractRegex(block, /layer:\s*(\d+)/);
        const operationalRole = this.extractRegex(block, /operationalRole:\s*["']([^"']+)["']/) as any;
        const priority = this.extractRegex(block, /priority:\s*["']([^"']+)["']/) as any;

        if (id && type && version) {
          return {
            id,
            type,
            version,
            runtime: runtime || "NodeJS",
            layer: layerStr ? parseInt(layerStr, 10) : 3,
            operationalRole: operationalRole || "savant",
            optimization: {
              priority: priority || "readability",
              assertionSuite: ""
            },
            docs: {
              description: this.extractRegex(block, /description:\s*["']([^"']+)["']/) || "",
              author: this.extractRegex(block, /author:\s*["']([^"']+)["']/) || "",
              sdoa: "5.0.0"
            }
          };
        }
      } catch (_) {}
    }

    // 2. Try to find JSDoc block manifest annotations (SDOA v4 compatibility)
    if (content.includes('@SdoaManifest')) {
      const name = this.extractRegex(content, /Name:\s*([^\r\n]+)/);
      const type = this.extractRegex(content, /Type:\s*([^\r\n]+)/)?.toLowerCase() as any;
      const version = this.extractRegex(content, /Version:\s*([^\r\n]+)/);
      const desc = this.extractRegex(content, /Description:\s*([^\r\n]+)/);
      const author = this.extractRegex(content, /Author:\s*([^\r\n]+)/);

      if (name && type && version) {
        return {
          id: name.trim(),
          type: type.trim().includes('component') ? 'primitive' : 'service',
          version: version.trim(),
          runtime: "NodeJS",
          layer: 3,
          operationalRole: "savant",
          optimization: { priority: "readability", assertionSuite: "" },
          docs: {
            description: desc ? desc.trim() : "",
            author: author ? author.trim() : "",
            sdoa: "4.0.0"
          }
        };
      }
    }

    return null;
  }

  private extractRegex(block: string, regex: RegExp): string | null {
    const m = block.match(regex);
    return m ? m[1] : null;
  }

  private resolveCollision(moduleA: SdoaManifest, moduleB: SdoaManifest): SdoaManifest {
    // Rule 1: Higher Semver Version wins
    const valA = moduleA.version.split('.').map(Number);
    const valB = moduleB.version.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((valA[i] || 0) > (valB[i] || 0)) return moduleA;
      if ((valB[i] || 0) > (valA[i] || 0)) return moduleB;
    }

    // Rule 2: Optimization settings arbitration (speed: Wasm > NodeJS)
    if (moduleA.optimization?.priority === 'speed' || moduleB.optimization?.priority === 'speed') {
      if (moduleA.runtime === 'Wasm') return moduleA;
      if (moduleB.runtime === 'Wasm') return moduleB;
    }

    return moduleA; // Default fallback
  }

  private writeMasterManifest(): void {
    const catalogData = this.catalog();
    const masterManifest = {
      sdoaVersion: "5.0.0",
      generatedAt: new Date().toISOString(),
      totalModules: catalogData.length,
      modules: catalogData
    };

    const outputPath = path.join(this.watchPath, "master.manifest.json");
    fs.writeFileSync(outputPath, JSON.stringify(masterManifest, null, 2), 'utf-8');
    console.log(`💾 SDOA Registrar: Successfully compiled master manifest catalog to: ${outputPath}`);
  }
}
