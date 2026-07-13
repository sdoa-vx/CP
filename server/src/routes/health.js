"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANIFEST = void 0;
exports.handleHealth = handleHealth;
exports.getSystemMetrics = getSystemMetrics;
exports.MANIFEST = {
    id: "health.ts",
    type: "module",
    layer: 4,
    runtime: "TypeScript",
    version: "1.0.0",
    operationalRole: "infrastructure",
    optimization: { priority: "stability" },
    capabilities: [
        "handleHealth",
        "getSystemMetrics"
    ],
    dependencies: [
        "http"
    ],
    docs: "Auto-generated enriched SDOA manifest via static analysis"
};
function handleHealth(req, res) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(getSystemMetrics()));
}
function getSystemMetrics() {
    return {
        status: "ok",
        version: "1.0.3",
        memory: process.memoryUsage(),
        uptime: process.uptime()
    };
}
