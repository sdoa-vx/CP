// ------------------------------------------------------------------
// File:    extractionAggregationEngine.ts
// Version: 1.0.0
// Updated: 2026-06-23T17:55:00.000Z
// Changes: Initial creation of extraction aggregation engine
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.extraction.aggregation",
  type: "engine",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: ["aggregate.extractionEvents"],
  commands: ["aggregateExtractionData"],
  events: ["extraction.analytics", "extraction.driftHeatmap"],
  accepts: ["extractionEvent[]"],
  slots: [],
  dependencies: [
    "engine.extraction.queryEvents",
    "registry.schema.extractionEvent"
  ],
  sovereign_lineage: "engine.extraction.aggregation",
  variant_of: null,
  docs: {
    description: "Aggregates ExtractionEvent records into analytics and drift heatmap models.",
    last_modified: "2026-06-23T17:55:00.000Z"
  }
} as const;

import type { ExtractionEvent } from "../../substrate/registry/schemas/extractionEvent.schema";
import { sendToExtension } from "../../ipc/vscodeBridge";

// Avoid importing from extension directly for type safety during server build
export interface ExtractionAnalyticsSummary {
  totalEvents: number;
  byModuleType: Record<string, number>;
  avgDrift: number;
  avgExtractionScore: number;
}

export interface DriftHeatmapCell {
  bucketLabel: string;
  driftBand: string;
  count: number;
}

export interface DriftHeatmapModel {
  buckets: string[];
  bands: string[];
  cells: DriftHeatmapCell[];
}

export async function aggregateExtractionData(events: ExtractionEvent[]) {
  const analytics = buildAnalytics(events);
  const heatmap = buildDriftHeatmap(events);

  sendToExtension("extraction.analytics", analytics);
  sendToExtension("extraction.driftHeatmap", heatmap);
}

// ------------------------------------------------------------
// ANALYTICS SUMMARY
// ------------------------------------------------------------

function buildAnalytics(events: ExtractionEvent[]): ExtractionAnalyticsSummary {
  const totalEvents = events.length;

  const byModuleType: Record<string, number> = {};
  let driftSum = 0;
  let extractionSum = 0;

  for (const e of events) {
    byModuleType[e.module_type] = (byModuleType[e.module_type] ?? 0) + 1;
    driftSum += e.drift_score;
    extractionSum += e.extraction_score;
  }

  return {
    totalEvents,
    byModuleType,
    avgDrift: totalEvents ? driftSum / totalEvents : 0,
    avgExtractionScore: totalEvents ? extractionSum / totalEvents : 0
  };
}

// ------------------------------------------------------------
// DRIFT HEATMAP
// ------------------------------------------------------------

function buildDriftHeatmap(events: ExtractionEvent[]): DriftHeatmapModel {
  // 1. Time buckets (hourly)
  const buckets = buildTimeBuckets(events);

  // 2. Drift bands
  const bands = ["low", "medium", "high"];

  // 3. Count events per bucket/band
  const cells = [];

  for (const bucket of buckets) {
    for (const band of bands) {
      const count = events.filter((e) => {
        const bucketLabel = bucketLabelFor(e.created_at);
        return bucketLabel === bucket && classifyDriftBand(e.drift_score) === band;
      }).length;

      cells.push({
        bucketLabel: bucket,
        driftBand: band,
        count
      });
    }
  }

  return { buckets, bands, cells };
}

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function classifyDriftBand(score: number): "low" | "medium" | "high" {
  if (score >= 80) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function bucketLabelFor(timestamp: string): string {
  if (!timestamp) return "Unknown";
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`;
}

function buildTimeBuckets(events: ExtractionEvent[]): string[] {
  const set = new Set<string>();
  for (const e of events) {
    if (e.created_at) {
      set.add(bucketLabelFor(e.created_at));
    }
  }
  return Array.from(set).sort();
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
