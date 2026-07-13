import fs from "fs";
import { Chronicle } from "./Chronicle.service";
import { emit, subscribe, unsubscribe } from "../engine/events";

export interface SleeveVersion {
  versionId: string;
  artifactPath: string;
  createdAt: string;
  metadata?: any;
}

export interface RegistryEntry {
  moduleId: string;
  versions: SleeveVersion[];
  currentActiveVersion: string | null;
}

export class ProvisionerService {
  private _registry = new Map<string, RegistryEntry>();
  private _busUnsub: Array<() => void> = [];

  async init() {
    this._subscribeEvents();
  }

  async run() {
    return { status: "ready", registrySize: this._registry.size };
  }

  async dispose() {
    this._unsubscribeEvents();
  }

  // Called by AssemblyLine handoff
  handoff(moduleId: string, artifactPath: string): boolean {
    if (!fs.existsSync(artifactPath)) {
      console.error(`[Provisioner] Handoff failed: Artifact not found at ${artifactPath}`);
      return false;
    }
    
    this.registerSleeve(moduleId, artifactPath);
    return true;
  }

  registerSleeve(moduleId: string, artifactPath: string, metadata: any = {}) {
    const versionId = `v_${Date.now()}`;
    const version: SleeveVersion = {
      versionId,
      artifactPath,
      createdAt: new Date().toISOString(),
      metadata
    };

    if (!this._registry.has(moduleId)) {
      this._registry.set(moduleId, {
        moduleId,
        versions: [],
        currentActiveVersion: null
      });
      Chronicle.recordEvent("provisioner:registered", { moduleId }, "Provisioner");
    }

    const entry = this._registry.get(moduleId)!;
    entry.versions.push(version);

    Chronicle.recordEvent("provisioner:version_added", { moduleId, versionId, artifactPath }, "Provisioner");
    this._emit("provisioner:registered", { moduleId, versionId, artifactPath });

    return version;
  }

  getRegistry() {
    return Array.from(this._registry.values());
  }

  getSleeveVersions(moduleId: string) {
    const entry = this._registry.get(moduleId);
    return entry ? entry.versions : [];
  }

  private _subscribeEvents() {
    // Optionally subscribe to AssemblyLine events directly instead of handoff method
    const onBuildSuccess = (payload: any) => {
      const { moduleId, procId, data } = payload;
      // Depending on how AssemblyLine emits, we can register here
      // But handoff interface is more direct.
    };

    const onInnovationBuilt = (payload: any) => {
      const { candidateId, moduleId, artifactPath } = payload;
      this.registerSleeve(moduleId, artifactPath);
      this._emit("innovation:registered", { candidateId, moduleId, artifactPath });
    };

    subscribe("assembly:build_success", onBuildSuccess);
    subscribe("innovation:built", onInnovationBuilt);
    
    this._busUnsub.push(
      () => unsubscribe("assembly:build_success", onBuildSuccess),
      () => unsubscribe("innovation:built", onInnovationBuilt)
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

export const Provisioner = new ProvisionerService();
