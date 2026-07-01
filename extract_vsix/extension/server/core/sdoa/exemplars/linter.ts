// Last modified: 2026-06-09 08:46 UTC
// linter.ts — SDOAv5.0 Compliance Linter API

import * as fs from "fs";

export interface LintResult {
  file: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function lintContent(content: string, filePath: string): LintResult {
  const lines = content.split(/\r?\n/);
  const totalLines = lines.length;

  const errors: string[] = [];
  const warnings: string[] = [];

  let detectedLayer: number | null = null;
  let detectedType: string | null = null;

  const manifestMatch = content.match(/["']?layer["']?\s*:\s*(1|2|3)/);
  if (manifestMatch) {
    detectedLayer = parseInt(manifestMatch[1], 10);
  }
  const typeMatch = content.match(/["']?type["']?\s*:\s*["'](service|workflow|adapter|primitive|feature|engine|task|utility|component)["']/);
  if (typeMatch) {
    detectedType = typeMatch[1];
  }

  // Fallback to path heuristics
  const normPath = filePath.replace(/\\/g, "/");
  if (detectedLayer === null) {
    if (normPath.includes("ui/primitives") || normPath.includes(".prim.")) {
      detectedLayer = 2;
      detectedType = "primitive";
    } else if (normPath.includes("ui/features") || normPath.includes(".feature.")) {
      detectedLayer = 1;
      detectedType = "feature";
    } else if (normPath.includes("substrate") || normPath.includes("authorities")) {
      detectedLayer = 3;
    }
  }

  if (detectedLayer === null) {
    errors.push("Could not determine SDOA layer (1, 2, or 3). Please check layer field in manifest or path.");
    return { file: filePath, ok: false, errors, warnings };
  }

  // 1. Line Limit Checks
  const limits: Record<number, number> = { 1: 200, 2: 150, 3: 200 };
  const limit = limits[detectedLayer];
  if (totalLines > limit) {
    errors.push(`Line count is ${totalLines}, which exceeds the limit of ${limit} for Layer ${detectedLayer}.`);
  }

  const isPython = filePath.endsWith(".py");
  const isTypeScript = filePath.endsWith(".ts");

  // 2. Strict Mode & Eval Checks (JS/TS only)
  if (!isPython) {
    // Strip comments first in the first 5000 characters
    const cleanPrefix = content.slice(0, 5000).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").trim();
    const hasStrict = cleanPrefix.match(/["']use strict["']/);

    // For pure JS, use strict is mandatory. For TS, modules are strict by default.
    if (!isTypeScript && !hasStrict) {
      errors.push("Missing 'use strict' statement at top.");
    }

    if (content.includes("eval(") || content.includes("eval ")) {
      errors.push("Prohibited use of eval(). Use new Function() if sandbox is required.");
    }
  }

  // Layer Specific Check Rules
  if (detectedLayer === 3) {
    if (isPython) {
      if (!content.includes("MANIFEST_JSON =") && !content.includes("MANIFEST =")) {
        errors.push("Python Layer 3 component must declare MANIFEST or MANIFEST_JSON.");
      }
      if (!content.includes("class ") || (!content.includes("(Service):") && !content.includes("(SdoaModule):") && !content.includes("(Dashboard):"))) {
        errors.push("Python Layer 3 component must declare a class inheriting from Service, SdoaModule, or Dashboard.");
      }
    } else {
      // NodeJS / NodeJS Sidecar Environment Checks
      const windowMatches = content.match(/window\.[a-zA-Z0-9_$]+/g);
      if (windowMatches) {
        windowMatches.forEach(match => {
          if (!content.includes(`typeof window`) || !content.match(new RegExp(`typeof window\\s*!==?\\s*['"]undefined['"]`))) {
            errors.push(`Prohibited global reference in Layer 3: '${match}'`);
          }
        });
        if (content.match(/\bwindow\b/) && !content.match(/\btypeof window\b/)) {
          errors.push("Found bare 'window' reference in NodeJS service. Layer 3 must not access window.");
        }
      }

      if (!content.includes("static MANIFEST =") && !content.includes("static MANIFEST:") && !content.includes("static MANIFEST :")) {
        errors.push("Layer 3 class must declare 'static MANIFEST = { ... }'.");
      }

      const hasExport = isTypeScript
        ? (content.includes("export class ") || content.includes("export default class ") || content.includes("export = "))
        : content.match(/module\.exports\s*=\s*(\{[^}]+\}|[a-zA-Z0-9_$]+)/);
      if (!hasExport) {
        errors.push(isTypeScript ? "Layer 3 TypeScript file must export a class." : "Layer 3 file must end with module.exports = ClassName or export block.");
      }

      const initFnMatch = content.match(/async\s+init\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*async\s+run/);
      if (initFnMatch && initFnMatch[1].includes("setTimeout")) {
        errors.push("Prohibited use of setTimeout() inside init(). Deflect to run() or lifecycle methods.");
      }

      if (content.includes("setTimeout") && !content.includes("clearTimeout") && !content.includes("_timers")) {
        warnings.push("setTimeout is used, but no clearTimeout or _timers cleanup was found. Potential memory leak.");
      }

      // Check if it's the EventBus helper itself; don't trigger the warning for the core EventBus
      if (content.includes("window.EventBus") && !filePath.includes("EventBus.service.js") && !filePath.includes("eventbus.ts")) {
        errors.push("Prohibited fallback reference to window.EventBus in Layer 3 EventBus helper.");
      }
    }

  } else if (detectedLayer === 2 || detectedLayer === 1) {
    // Browser environment primitives and features
    const cleanStart = content.replace(/^(\s*(\/\/.*|\/\*[\s\S]*?\*\/))*/, "").trim();
    const isIIFE = cleanStart.startsWith("(") && (cleanStart.endsWith(")") || cleanStart.endsWith(");") || cleanStart.endsWith("}()") || cleanStart.endsWith("})()"));
    if (!isIIFE && !isTypeScript) {
      errors.push(`Layer ${detectedLayer} component should be wrapped in an IIFE: (function() { ... })()`);
    }

    if (content.includes("static MANIFEST")) {
      errors.push("Browser Layer components must use 'const MANIFEST', not static MANIFEST.");
    }

    if (detectedLayer === 2) {
      if (!content.includes("window.ModuleLoader.register") && !content.includes("ModuleLoader.register") && !isTypeScript) {
        warnings.push("Missing window.ModuleLoader.register call.");
      }
      if (content.includes("fetch(")) {
        errors.push("Prohibited use of fetch() in Layer 2 primitives. Primitives must be pure DOM.");
      }
    } else {
      if (!content.includes("mount") || !content.includes("unmount")) {
        errors.push("Layer 1 Features must implement and export mount and unmount actions.");
      }
    }
  }

  // 4. Validate MANIFEST structure if parsing is possible
  try {
    const versionMatch = content.match(/["']?version["']?\s*[:=]\s*["']([^"']+)["']/);
    const expectedVer = detectedLayer === 2 ? "4.0.0" : "5.0.0";
    if (versionMatch && versionMatch[1] !== expectedVer) {
      // Allow general matching or don't error if it is not a strict primitive
      if (detectedType === "primitive" || versionMatch[1].startsWith("5.") || versionMatch[1].startsWith("4.")) {
         // keep check relaxed for non-primitives
      } else {
         errors.push(`Manifest version must be '${expectedVer}', found '${versionMatch[1]}'.`);
      }
    }

    const idMatch = content.match(/["']?id["']?\s*[:=]\s*["']([^"']+)["']/);
    if (!idMatch) {
      errors.push("Manifest missing required 'id' field.");
    }
  } catch (e: any) {
    warnings.push("Could not fully parse manifest parameters: " + e.message);
  }

  return {
    file: filePath,
    ok: errors.length === 0,
    errors,
    warnings
  };
}

export function lintFile(filePath: string): LintResult {
  const fsModule = require("fs");
  if (!fsModule.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fsModule.readFileSync(filePath, "utf8");
  return lintContent(content, filePath);
}
