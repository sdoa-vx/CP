// Last modified: 2026-06-14 04:50 UTC
"use strict";

const fs   = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const fallback = require("./VfsManifestExtractorFallback.js");

class VfsManifestExtractor {
    static MANIFEST = {
        id:           "VfsManifestExtractor.service",
        type:         "service",
        layer:        3,
        runtime:      "NodeJS",
        version:      "5.0.1",
        capabilities: ["vfs:extract-manifest"],
        dependencies: ["VfsManifestExtractorFallback.service"],
        docs: {
            description: "High-performance native C++ VFS manifest extractor (vfs-extractor.exe) that falls back to the pure-JS extractor when the binary is missing or errors.",
            author: "ProtoAI team",
        },
        last_modified: "2026-07-13T00:00:00Z",
    };

    extract(realPath, type) {
        // Try C++ high-performance extractor first
        try {
            const extBinary = path.join(__dirname, "vfs-extractor.exe");
            if (fs.existsSync(extBinary)) {
                const stdout = execFileSync(extBinary, [realPath, type], {
                    encoding: "utf8",
                    windowsHide: true,
                    maxBuffer: 10 * 1024 * 1024 // 10MB
                });
                const parsed = JSON.parse(stdout);
                if (parsed && !parsed.error) {
                    return parsed;
                }
            }
        } catch (cppErr) {
            // Silently fall back to JS version
        }

        // Fall back to JS implementation
        return fallback.extract(realPath, type);
    }
}

module.exports = new VfsManifestExtractor();
