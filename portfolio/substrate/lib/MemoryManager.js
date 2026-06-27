// ──────────────────────────────────────────────────────────────────
// File:    MemoryManager.js (lib alias)
// Version: 2.1.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Created as canonical lib/ alias — re-exports from services/
//          Satisfies require("../lib/MemoryManager") from substrate/services/
//          and substrate/workflows/ modules.
// ──────────────────────────────────────────────────────────────────
"use strict";

// Re-export the singleton from the canonical services location.
// This avoids duplicating the MemoryManager source while satisfying
// all require("../lib/MemoryManager") calls from substrate/services/
// and require("../../lib/MemoryManager") calls from substrate/workflows/.
module.exports = require("../services/MemoryManager");
