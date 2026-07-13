import { Chronicle, ChronicleEntry } from "./Chronicle.service";

export interface TimeMachineEvent {
  id: string;
  timestamp: string;
  type: string;
  moduleId?: string;
  sleeveId?: string;
  payload: any;
  hash: string;
  previousHash: string;
}

export interface MeshStateSnapshot {
  timestamp: string;
  modules: any[];
  sleeves: any[];
  routes: any[];
}

export class TimeMachineService {
  async init() {}
  async run() { return { status: "ready" }; }
  async dispose() {}

  // Get chronological sequence of sovereignty events
  getTimeline(): TimeMachineEvent[] {
    const chain: ChronicleEntry[] = Chronicle.replay();
    return chain
      .filter(block => [
        "event:proposal:merged",
        "event:assembly:build_success",
        "event:provisioner:registered",
        "event:provisioner:version_added",
        "event:lifecycle:activated",
        "event:lifecycle:deactivated",
        "event:lifecycle:rolled_back",
        "event:arbitration:routed",
        "event:arbitration:route_updated",
        "event:arbitration:override",
        "event:pulse:anomalyDetected",
        "event:governance:violation_detected",
        "event:governance:decision_made"
      ].includes(block.type))
      .map(block => {
        const eventName = block.type.replace("event:", "");
        return {
          id: block.id.substring(0, 8),
          timestamp: block.timestamp,
          type: eventName,
          moduleId: block.payload?.moduleId,
          sleeveId: block.payload?.versionId || block.payload?.sleeveId || block.payload?.targetVersion,
          payload: block.payload,
          hash: block.id,
          previousHash: block.prevHash
        };
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // Reconstruct the exact state of the mesh up to a given timestamp
  replayAt(targetTimestamp: string): MeshStateSnapshot {
    const timeline = this.getTimeline();
    const targetMs = new Date(targetTimestamp).getTime();

    const snapshot: MeshStateSnapshot = {
      timestamp: targetTimestamp,
      modules: [],
      sleeves: [],
      routes: []
    };

    // We replay events sequentially to build the state
    const modules = new Set<string>();
    const sleeves = new Map<string, string[]>(); // moduleId -> sleeveIds
    const activeSleeves = new Map<string, string>(); // moduleId -> active sleeveId
    const routes = new Map<string, any>(); // moduleId -> route state

    for (const event of timeline) {
      if (new Date(event.timestamp).getTime() > targetMs) break;

      const { type, payload, moduleId } = event;

      if (!moduleId) continue;
      modules.add(moduleId);

      switch (type) {
        case "provisioner:version_added":
          if (!sleeves.has(moduleId)) sleeves.set(moduleId, []);
          if (payload.versionId) sleeves.get(moduleId)!.push(payload.versionId);
          break;
        case "lifecycle:activated":
        case "lifecycle:rolled_back":
          if (payload.versionId || payload.targetVersion || payload.to) {
             activeSleeves.set(moduleId, payload.versionId || payload.targetVersion || payload.to);
          }
          break;
        case "lifecycle:deactivated":
          activeSleeves.delete(moduleId);
          break;
        case "arbitration:route_updated":
        case "arbitration:override":
          routes.set(moduleId, {
            activeSleeveId: payload.sleeveId || payload.newSleeveId,
            isOverridden: type === "arbitration:override",
            driftStatus: "nominal"
          });
          break;
        case "pulse:anomalyDetected":
          const route = routes.get(moduleId);
          if (route) {
            route.driftStatus = payload.severity === "high" ? "critical" : "degraded";
          }
          break;
      }
    }

    // Serialize Maps to Arrays
    snapshot.modules = Array.from(modules).map(id => ({ id }));
    snapshot.sleeves = Array.from(sleeves.entries()).map(([modId, vers]) => ({ moduleId: modId, versions: vers }));
    
    // Merge active state into routes for the snapshot
    routes.forEach((route, modId) => {
      snapshot.routes.push({
        moduleId: modId,
        activeSleeveId: route.activeSleeveId,
        isOverridden: route.isOverridden,
        driftStatus: route.driftStatus
      });
    });

    return snapshot;
  }

  // Semantic Diff Engine
  diffStates(timestampA: string, timestampB: string) {
    const stateA = this.replayAt(timestampA);
    const stateB = this.replayAt(timestampB);

    const diff = {
      structural: {
        addedModules: [] as string[],
        removedModules: [] as string[],
        sleeveChanges: [] as any[]
      },
      semantic: [] as string[]
    };

    // 1. Structural Deltas
    const modsA = new Set(stateA.modules.map(m => m.id));
    const modsB = new Set(stateB.modules.map(m => m.id));
    
    for (const m of modsB) if (!modsA.has(m)) diff.structural.addedModules.push(m);
    for (const m of modsA) if (!modsB.has(m)) diff.structural.removedModules.push(m);

    // Analyze route changes
    for (const routeB of stateB.routes) {
      const routeA = stateA.routes.find(r => r.moduleId === routeB.moduleId);
      if (!routeA) {
        diff.structural.sleeveChanges.push({ moduleId: routeB.moduleId, newSleeve: routeB.activeSleeveId });
        diff.semantic.push(`Module ${routeB.moduleId} activated on sleeve ${routeB.activeSleeveId}`);
      } else if (routeA.activeSleeveId !== routeB.activeSleeveId) {
        diff.structural.sleeveChanges.push({ moduleId: routeB.moduleId, oldSleeve: routeA.activeSleeveId, newSleeve: routeB.activeSleeveId });
        diff.semantic.push(`Module ${routeB.moduleId} migrated from sleeve ${routeA.activeSleeveId} to ${routeB.activeSleeveId}`);
      }

      if (routeA && routeA.driftStatus !== routeB.driftStatus) {
        diff.semantic.push(`Module ${routeB.moduleId} health changed from ${routeA.driftStatus} to ${routeB.driftStatus}`);
      }
    }

    // Connect to timeline events that occurred between A and B
    const msA = new Date(timestampA).getTime();
    const msB = new Date(timestampB).getTime();
    const eventsBetween = this.getTimeline().filter(e => {
      const t = new Date(e.timestamp).getTime();
      return t > msA && t <= msB;
    });

    for (const ev of eventsBetween) {
      if (ev.type === "governance:violation_detected") {
        diff.semantic.push(`[${ev.moduleId}] Violation detected: ${ev.payload?.description || ev.payload?.ruleId}`);
      } else if (ev.type === "arbitration:override") {
        diff.semantic.push(`[${ev.moduleId}] Manual override routed traffic to ${ev.payload?.newSleeveId}`);
      }
    }

    return diff;
  }
}

export const TimeMachine = new TimeMachineService();
