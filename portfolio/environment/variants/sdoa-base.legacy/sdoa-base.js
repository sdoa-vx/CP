// ──────────────────────────────────────────────────────────────────
// File:    sdoa-base.js
// Version: 3.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure (6.14 legacy variant — no 'use strict')
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-03 06:10 UTC
// ============================================================
// sdoa-base.js — SDOA v3.0 Core Base Classes
// ============================================================

class SdoaModule {
    static MANIFEST = {
        id: "sdoa-base",
        type: "primitive",
        runtime: "NodeJS",
        version: "3.0.0",
        capabilities: ["sdoa_module_base_classes"],
        dependencies: [],
        docs: {
            description: "Core base class definitions for SDOA Services, Adapters, Tasks, and Components.",
            author: "ProtoAI Core Team",
            sdoa: "5.0.0"
        },
        "Last modified": "2026-06-03 06:10 UTC"
    };

    constructor(registry) {
        this.registry = registry;
    }

    emit(event, payload) {
        console.log(`[SDOA Event] Emit ${event}:`, payload);
        if (this.registry && typeof this.registry.broadcast === 'function') {
            this.registry.broadcast({ type: event, payload });
        }
    }

    bump_patch(msg) {
        console.log(`[SDOA SemVer] Bump Patch: ${msg}`);
    }

    bump_minor(msg) {
        console.log(`[SDOA SemVer] Bump Minor: ${msg}`);
    }

    bump_major(msg) {
        console.log(`[SDOA SemVer] Bump Major: ${msg}`);
    }
}

class Service extends SdoaModule {}
class Adapter extends SdoaModule {}
class Task extends SdoaModule {}
class Component extends SdoaModule {}

module.exports = {
    Service,
    Adapter,
    Task,
    Component
};
