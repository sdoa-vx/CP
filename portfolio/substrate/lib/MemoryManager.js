// ──────────────────────────────────────────────────────────────────
// File:    MemoryManager.js (lib alias)
// Version: 2.1.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Created as canonical lib/ alias — re-exports from services/
//          Satisfies require("../lib/MemoryManager") from substrate/services/
//          and substrate/workflows/ modules.
// ──────────────────────────────────────────────────────────────────
"use strict";

const MANIFEST = {
    id:            "MemoryManager.service.alias",
    type:          "service",
    layer:         3,
    runtime:       "NodeJS",
    version:       "2.1.1",
    variant_of:    "MemoryManager.service",
    capabilities:  ["memory:reexport-alias"],
    dependencies:  ["MemoryManager.service"],
    docs: {
        description: "Canonical lib/ alias that re-exports the MemoryManager singleton from substrate/services/ so both substrate/services/ and substrate/workflows/ can require it via a stable relative path without duplicating source.",
        author: "ProtoAI team",
    },
    last_modified: "2026-07-13T00:00:00Z",
};

// Re-export the singleton from the canonical services location.
// This avoids duplicating the MemoryManager source while satisfying
// all require("../lib/MemoryManager") calls from substrate/services/
// and require("../../lib/MemoryManager") calls from substrate/workflows/.
module.exports = require("../services/MemoryManager");
