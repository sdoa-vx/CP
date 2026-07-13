import { Chronicle } from "./Chronicle.service";
import { Provisioner } from "./Provisioner.service";
import { emit, subscribe, unsubscribe } from "../engine/events";
import { PrimeDiscovery } from "./PrimeDiscovery.service";

export interface LifecycleState {
  moduleId: string;
  activeVersionId: string | null;
  status: "inactive" | "active" | "error";
  lastTransitionAt: string;
}

export class LifecycleManagerService {
  private _states = new Map<string, LifecycleState>();
  private _busUnsub: Array<() => void> = [];

  async init() {
    this._subscribeEvents();
  }

  async run() {
    return { status: "ready", activeModules: this._states.size };
  }

  async dispose() {
    this._unsubscribeEvents();
  }

  activateSleeve(moduleId: string, versionId?: string) {
    const versions = Provisioner.getSleeveVersions(moduleId);
    if (!versions || versions.length === 0) {
      throw new Error(`Cannot activate: Module ${moduleId} has no registered versions.`);
    }

    const targetVersion = versionId || versions[versions.length - 1].versionId;

    if (!this._states.has(moduleId)) {
      this._states.set(moduleId, {
        moduleId,
        activeVersionId: null,
        status: "inactive",
        lastTransitionAt: new Date().toISOString()
      });
    }

    const state = this._states.get(moduleId)!;
    const previousVersion = state.activeVersionId;
    
    state.activeVersionId = targetVersion;
    state.status = "active";
    state.lastTransitionAt = new Date().toISOString();

    // In a real implementation, we would instruct Arbitration to route here.
    // For now, we emit the event.
    Chronicle.recordEvent("lifecycle:activated", { moduleId, targetVersion, previousVersion }, "LifecycleManager");
    this._emit("lifecycle:activated", { moduleId, versionId: targetVersion });
    
    return state;
  }

  deactivateSleeve(moduleId: string) {
    const state = this._states.get(moduleId);
    if (!state || state.status === "inactive") return false;

    Chronicle.recordEvent("lifecycle:deactivated", { moduleId, activeVersion: state.activeVersionId }, "LifecycleManager");
    
    state.status = "inactive";
    state.activeVersionId = null;
    state.lastTransitionAt = new Date().toISOString();
    
    this._emit("lifecycle:deactivated", { moduleId });
    return true;
  }

  rollbackSleeve(moduleId: string) {
    const versions = Provisioner.getSleeveVersions(moduleId);
    if (!versions || versions.length < 2) {
      throw new Error(`Cannot rollback: Module ${moduleId} does not have a previous version.`);
    }

    const state = this._states.get(moduleId);
    const currentVersion = state?.activeVersionId;
    
    // Find the version immediately preceding the current one
    let targetVersion = versions[versions.length - 2].versionId;
    if (currentVersion) {
      const idx = versions.findIndex(v => v.versionId === currentVersion);
      if (idx > 0) {
        targetVersion = versions[idx - 1].versionId;
      }
    }

    const result = this.activateSleeve(moduleId, targetVersion);
    Chronicle.recordEvent("lifecycle:rolled_back", { moduleId, from: currentVersion, to: targetVersion }, "LifecycleManager");
    return result;
  }

  getStates() {
    return Array.from(this._states.values());
  }

  private _subscribeEvents() {
    const onProvisionerRegistered = (payload: any) => {
      const { moduleId } = payload;
      if (!this._states.has(moduleId)) {
        this._states.set(moduleId, {
          moduleId,
          activeVersionId: null,
          status: "inactive",
          lastTransitionAt: new Date().toISOString()
        });
      }
    };

    const onArbitrationRollback = (payload: any) => {
      const { moduleId } = payload;
      try {
        this.rollbackSleeve(moduleId);
      } catch (err: any) {
        Chronicle.recordEvent("lifecycle:rollback_failed", { moduleId, error: err.message }, "LifecycleManager");
      }
    };

    const onArbitrationSpike = (payload: any) => {
      const { moduleId, metrics } = payload;
      // Simulate horizontal scale-out
      Chronicle.recordEvent("lifecycle:scale_out_triggered", { moduleId, reason: "high_traffic", rps: metrics.requestsPerSecond }, "LifecycleManager");
    };

    const onInnovationRegistered = (payload: any) => {
      const { candidateId, moduleId } = payload;
      try {
        this.activateSleeve(moduleId);
        PrimeDiscovery.updateCandidateStatus(candidateId, 'activated');
        this._emit("innovation:activated", { candidateId, moduleId });
      } catch (err: any) {
        PrimeDiscovery.updateCandidateStatus(candidateId, 'failed', undefined, undefined, err.message);
        this._emit("innovation:failed", { candidateId, error: err.message });
      }
    };

    subscribe("provisioner:registered", onProvisionerRegistered);
    subscribe("arbitration:request_rollback", onArbitrationRollback);
    subscribe("arbitration:traffic_spike", onArbitrationSpike);
    subscribe("innovation:registered", onInnovationRegistered);
    
    this._busUnsub.push(
      () => unsubscribe("provisioner:registered", onProvisionerRegistered),
      () => unsubscribe("arbitration:request_rollback", onArbitrationRollback),
      () => unsubscribe("arbitration:traffic_spike", onArbitrationSpike),
      () => unsubscribe("innovation:registered", onInnovationRegistered)
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

export const LifecycleManager = new LifecycleManagerService();
