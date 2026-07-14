import { Router } from "../utils/Router";
import { registerScanRoutes } from "./dashboardScanEngine";
import { registerTelemetryRoutes } from "./dashboardTelemetryRoutes";
import { registerProposalRoutes } from "./dashboardProposalRoutes";
import { registerFederationRoutes } from "./dashboardFederationRoutes";
import { registerGovernanceRoutes } from "./dashboardGovernanceRoutes";
import { registerStaticRoutes, staticRouter } from "./dashboardStaticRoutes";

// ============================================================
// dashboard.ts — SDOA v5 Route Core
// version: 5.0.0
// Last modified: 2026-07-14
//
// Phase 5 oversized-file split: all route handlers moved into six
// sibling route-group modules, each exporting a register*(router)
// function called below. This core is now just composition — creating
// the Router instance, registering every group in the same order the
// routes used to appear, and re-exporting `staticRouter` (now defined
// in dashboardStaticRoutes.ts) so server/src/index.ts's existing
// `import dashboardRouter, { staticRouter } from "./routes/dashboard"`
// keeps working unchanged.
//
// Route groups:
//   - dashboardScanEngine.ts:       workspace scan heuristics + scan actions
//   - dashboardTelemetryRoutes.ts:  engine-control/telemetry endpoints
//   - dashboardProposalRoutes.ts:   proposals/pipeline endpoints
//   - dashboardFederationRoutes.ts: peers/mesh endpoints
//   - dashboardGovernanceRoutes.ts: lineage/drift/governance JSON feeds
//   - dashboardStaticRoutes.ts:     logs/health + static asset/view serving
// ============================================================

export const MANIFEST = {
  id: "dashboard.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "5.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "staticRouter"
  ],
  dependencies: [
    "../utils/Router",
    "./dashboardScanEngine",
    "./dashboardTelemetryRoutes",
    "./dashboardProposalRoutes",
    "./dashboardFederationRoutes",
    "./dashboardGovernanceRoutes",
    "./dashboardStaticRoutes"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis. Route core — composes the six route-group modules extracted during the Phase 5 oversized-file split (1202 -> 72 lines). See dashboardScanEngine/Telemetry/Proposal/Federation/Governance/StaticRoutes.ts for the actual handlers."
};

const router = new Router();

registerScanRoutes(router);
registerTelemetryRoutes(router);
registerProposalRoutes(router);
registerFederationRoutes(router);
registerGovernanceRoutes(router);
registerStaticRoutes(router);

export { staticRouter };
export default router;
