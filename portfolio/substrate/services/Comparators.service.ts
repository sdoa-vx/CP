// ──────────────────────────────────────────────────────────────────
// File:    Comparators.service.ts
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// Comparators.service.ts — SDOA v5.0 Service
// version: 5.0.0
// Last modified: 2026-06-01 15:25 UTC
// ============================================================

import { TAlgosimObject, TASR, TASI, TASC, TRationalNumber, TRGB, THSV, THSL, TASOSignal } from '../Types';
import { SdoaManifest, Registry } from './Registry.service';

export class ComparatorsService {
  static MANIFEST: SdoaManifest = {
    id: "Comparators.service",
    type: "service",
    layer: 3,
    runtime: "NodeJS",
    version: "5.0.0",
    operationalRole: "savant",
    requires: ["Types"],
    lifecycle: ["init"],
    actions: {
      commands: {
        compareNumber: { description: "Compare numbers with epsilon tolerance", input: { result: "TAlgosimObject", expected: "number", testSL: "boolean", sl: "string" }, output: "boolean" },
        compareString: { description: "Compare strings", input: { result: "TAlgosimObject", expected: "string", testSL: "boolean", sl: "string" }, output: "boolean" },
        compareBoolean: { description: "Compare booleans", input: { result: "TAlgosimObject", expected: "boolean", testSL: "boolean", sl: "string" }, output: "boolean" },
        compareArray: { description: "Compare arrays (stub)", input: { result: "TAlgosimObject", expected: "any[]", testSL: "boolean", sl: "string" }, output: "boolean" },
        compareRGB: { description: "Compare RGB colors", input: { result: "TAlgosimObject", expected: "TRGB", testSL: "boolean", sl: "string" }, output: "boolean" },
        compareHSV: { description: "Compare HSV colors", input: { result: "TAlgosimObject", expected: "THSV", testSL: "boolean", sl: "string" }, output: "boolean" },
        compareHSL: { description: "Compare HSL colors", input: { result: "TAlgosimObject", expected: "THSL", testSL: "boolean", sl: "string" }, output: "boolean" },
        compareSignal: { description: "Compare signal types", input: { result: "TAlgosimObject", expected: "TASOSignal", testSL: "boolean", sl: "string" }, output: "boolean" },
        compareRational: { description: "Compare rational numbers", input: { result: "TAlgosimObject", expected: "TRationalNumber", testSL: "boolean", sl: "string" }, output: "boolean" }
      }
    },
    optimization: {
      priority: "readability",
      assertionSuite: ""
    },
    docs: {
      description: "Validation service comparing evaluated result objects to expected values.",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };

  async init(registry: Registry): Promise<void> {
    // Initialization logic
  }

  compareNumber(result: TAlgosimObject, expected: TASR, testSL: boolean, sl: string): boolean {
    if (result.type !== 'number') return false;
    const epsilon = 1e-10;
    const pass = Math.abs(result.value - expected) < epsilon;
    if (testSL && pass) return result.getAsSingleLineText?.() === sl;
    return pass;
  }

  compareString(result: TAlgosimObject, expected: string, testSL: boolean, sl: string): boolean {
    if (result.type !== 'string') return false;
    const pass = result.value === expected;
    if (testSL && pass) return result.getAsSingleLineText?.() === sl;
    return pass;
  }

  compareBoolean(result: TAlgosimObject, expected: boolean, testSL: boolean, sl: string): boolean {
    if (result.type !== 'boolean') return false;
    const pass = result.value === expected;
    if (testSL && pass) return result.getAsSingleLineText?.() === sl;
    return pass;
  }

  compareArray(result: TAlgosimObject, expected: any[], testSL: boolean, sl: string): boolean {
    if (result.type !== 'array') return false;
    return true; // Stub
  }

  compareRGB(result: TAlgosimObject, expected: TRGB, testSL: boolean, sl: string): boolean {
    if (result.type !== 'rgb') return false;
    const { r, g, b } = result.value as TRGB;
    return r === expected.r && g === expected.g && b === expected.b;
  }

  compareHSV(result: TAlgosimObject, expected: THSV, testSL: boolean, sl: string): boolean {
    if (result.type !== 'hsv') return false;
    const { h, s, v } = result.value as THSV;
    return h === expected.h && s === expected.s && v === expected.v;
  }

  compareHSL(result: TAlgosimObject, expected: THSL, testSL: boolean, sl: string): boolean {
    if (result.type !== 'hsl') return false;
    const { h, s, l } = result.value as THSL;
    return h === expected.h && s === expected.s && l === expected.l;
  }

  compareSignal(result: TAlgosimObject, expected: TASOSignal, testSL: boolean, sl: string): boolean {
    if (result.type !== 'signal') return false;
    return result.value === expected;
  }

  compareRational(result: TAlgosimObject, expected: TRationalNumber, testSL: boolean, sl: string): boolean {
    if (result.type !== 'rational') return false;
    const { num, den } = result.value as TRationalNumber;
    return num === expected.num && den === expected.den;
  }
}
