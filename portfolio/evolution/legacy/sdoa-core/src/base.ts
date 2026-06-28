// ──────────────────────────────────────────────────────────────────
// File:    base.ts
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Distributed from _variances to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-09 08:30 UTC
// base.ts — SDOAv5.0 Core Base Classes

export class SdoaModule {
  public registry: any;

  constructor(registry?: any) {
    this.registry = registry;
  }

  emit(event: string, payload: any): void {
    const bus = this.registry?.get?.("EventBus.service");
    if (bus && typeof bus.emit === "function") {
      bus.emit(event, payload);
    } else {
      console.log(`[SDOA Event] Emit ${event}:`, payload);
      if (this.registry && typeof this.registry.broadcast === "function") {
        this.registry.broadcast({ type: event, payload });
      }
    }
  }

  bump_patch(msg: string): void {
    console.log(`[SDOA SemVer] Bump Patch: ${msg}`);
  }

  bump_minor(msg: string): void {
    console.log(`[SDOA SemVer] Bump Minor: ${msg}`);
  }

  bump_major(msg: string): void {
    console.log(`[SDOA SemVer] Bump Major: ${msg}`);
  }
}

export class Service extends SdoaModule {}
export class Adapter extends SdoaModule {}
export class Task extends SdoaModule {}
export class Component extends SdoaModule {}
export class Engine extends SdoaModule {}
export class Primitive extends SdoaModule {}
export class Feature extends SdoaModule {}
