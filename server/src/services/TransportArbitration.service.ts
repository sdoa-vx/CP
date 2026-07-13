import { Chronicle } from "./Chronicle.service";
import { emit, subscribe, unsubscribe } from "../engine/events";

export interface RouteMetrics {
  requestsPerSecond: number;
  averageLatencyMs: number;
  errorRate: number;
  totalRequests: number;
}

export interface RouteEntry {
  moduleId: string;
  activeSleeveId: string;
  isOverridden: boolean;
  driftStatus: "nominal" | "degraded" | "critical";
  lastRoutedAt: string;
  metrics: RouteMetrics;
}

export class TransportArbitrationService {
  private _routes = new Map<string, RouteEntry>();
  private _busUnsub: Array<() => void> = [];

  async init() {
    this._subscribeEvents();
  }

  async run() {
    return { status: "ready", activeRoutes: this._routes.size };
  }

  async dispose() {
    this._unsubscribeEvents();
  }

  // The actual routing logic (resolves abstract module to concrete sleeve)
  routeRequest(moduleId: string, simulatedLatencyMs = 50, simulatedError = false): string | null {
    const route = this._routes.get(moduleId);
    if (!route) return null;
    
    route.lastRoutedAt = new Date().toISOString();
    
    // Update metrics
    route.metrics.totalRequests++;
    
    // Exponential moving average for latency
    const alpha = 0.1; 
    route.metrics.averageLatencyMs = (alpha * simulatedLatencyMs) + ((1 - alpha) * route.metrics.averageLatencyMs);
    
    // Error rate moving average
    const errorVal = simulatedError ? 1.0 : 0.0;
    route.metrics.errorRate = (alpha * errorVal) + ((1 - alpha) * route.metrics.errorRate);
    
    // Basic RPS (just mock it as growing slightly if heavily hit)
    route.metrics.requestsPerSecond = route.metrics.totalRequests / (Math.max(1, (Date.now() - new Date(route.lastRoutedAt).getTime()) / 1000));

    // Predictive Routing: Sub-second traffic shedding
    if (route.metrics.averageLatencyMs > 200 && route.driftStatus !== "critical") {
      route.driftStatus = "degraded";
      // Could shed traffic here in a multi-node setup
    }

    return route.activeSleeveId;
  }

  // Simulate traffic across the mesh for predictive analysis
  simulateTrafficLoad(intensity: number) {
    // intensity multiplier
    for (const [moduleId, route] of this._routes.entries()) {
      const numRequests = Math.floor(Math.random() * 10 * intensity);
      for (let i = 0; i < numRequests; i++) {
        const latency = 20 + Math.random() * 80 * intensity; // spikes with intensity
        const isError = Math.random() < (0.01 * intensity); // errors scale with intensity
        this.routeRequest(moduleId, latency, isError);
      }
      
      // Spike detection
      if (route.metrics.errorRate > 0.1 || route.metrics.averageLatencyMs > 200) {
        this._emit("arbitration:traffic_spike", { moduleId, metrics: route.metrics });
      }
    }
  }

  overrideRoute(moduleId: string, sleeveId: string) {
    if (!this._routes.has(moduleId)) {
      this._routes.set(moduleId, {
        moduleId,
        activeSleeveId: sleeveId,
        isOverridden: true,
        driftStatus: "nominal",
        lastRoutedAt: new Date().toISOString(),
        metrics: { requestsPerSecond: 0, averageLatencyMs: 0, errorRate: 0, totalRequests: 0 }
      });
    } else {
      const route = this._routes.get(moduleId)!;
      route.activeSleeveId = sleeveId;
      route.isOverridden = true;
    }

    Chronicle.recordEvent("arbitration:override", { moduleId, newSleeveId: sleeveId }, "Arbitration");
    this._emit("arbitration:route_changed", { moduleId, sleeveId, overridden: true });
    return this._routes.get(moduleId);
  }

  getRoutingTable() {
    return Array.from(this._routes.values());
  }

  private _subscribeEvents() {
    // Listen to lifecycle events to dynamically update routes
    const onLifecycleActivated = (payload: any) => {
      const { moduleId, versionId } = payload;
      const route = this._routes.get(moduleId);
      
      // If it's overridden, we don't auto-update it
      if (route && route.isOverridden) return;

      this._routes.set(moduleId, {
        moduleId,
        activeSleeveId: versionId,
        isOverridden: false,
        driftStatus: "nominal",
        lastRoutedAt: new Date().toISOString(),
        metrics: { requestsPerSecond: 0, averageLatencyMs: 50, errorRate: 0, totalRequests: 0 }
      });
      Chronicle.recordEvent("arbitration:route_updated", { moduleId, sleeveId: versionId }, "Arbitration");
    };

    const onLifecycleDeactivated = (payload: any) => {
      const { moduleId } = payload;
      this._routes.delete(moduleId);
      Chronicle.recordEvent("arbitration:route_removed", { moduleId }, "Arbitration");
    };

    // Listen to Pulse to flag degrading routes and trigger self-healing
    const onPulseAnomaly = (payload: any) => {
      const { moduleId, severity } = payload;
      const route = this._routes.get(moduleId);
      if (route) {
        route.driftStatus = severity === "high" ? "critical" : "degraded";
        
        if (severity === "high") {
          Chronicle.recordEvent("arbitration:critical_drift", { moduleId }, "Arbitration");
          this._emit("arbitration:request_rollback", { moduleId });
        }
      }
    };

    subscribe("lifecycle:activated", onLifecycleActivated);
    subscribe("lifecycle:deactivated", onLifecycleDeactivated);
    subscribe("pulse:anomalyDetected", onPulseAnomaly);

    this._busUnsub.push(
      () => unsubscribe("lifecycle:activated", onLifecycleActivated),
      () => unsubscribe("lifecycle:deactivated", onLifecycleDeactivated),
      () => unsubscribe("pulse:anomalyDetected", onPulseAnomaly)
    );
  }

  private _unsubscribeEvents() {
    this._busUnsub.forEach(fn => fn());
    this._busUnsub = [];
  }

  private _emit(name: string, payload: any) {
    emit(name, payload);
  }
}

export const TransportArbitration = new TransportArbitrationService();
