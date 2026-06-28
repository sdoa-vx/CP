// ──────────────────────────────────────────────────────────────────
// File:    Types.ts
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// Types.ts — SDOA v5.0 Types
// version: 5.0.0
// Last modified: 2026-06-03 05:15 UTC
// ============================================================

export const MANIFEST = {
  id: "Types",
  type: "primitive",
  version: "5.0.0",
  runtime: "Universal",
  capabilities: ["type_definitions"],
  dependencies: [],
  docs: {
    description: "Common type definitions for SDOA components.",
    author: "ProtoAI team",
    sdoa: "5.0.0"
  }
};

export type TASR = number; // Real number
export type TASI = number; // Integer
export type TASC = { re: number; im: number }; // Complex number
export type TRationalNumber = { num: number; den: number }; // Rational number
export type TRGB = { r: number; g: number; b: number }; // RGB color
export type THSV = { h: number; s: number; v: number }; // HSV color
export type THSL = { h: number; s: number; l: number }; // HSL color
export type TASOSignal = 'success' | 'failure'; // Signal type

export interface TAlgosimObject {
  type: string;
  value: any;
  toString(): string;
  getAsSingleLineText?(formatOptions?: FormatOptions): string;
}

export interface TTestItem {
  line: number;
  expr: string;
  expected: string;
  actual: string;
  toString(): string;
}

export interface FormatOptions {
  numberFormat?: 'default' | 'fraction' | 'fixed' | 'scientific' | 'power';
  digits?: number;
  prettyExp?: boolean;
  digitGrouping?: number;
}

export interface TestOptions {
  line: number;
  expr: string;
  expected: any;
  testSL?: boolean;
  sl?: string;
}
