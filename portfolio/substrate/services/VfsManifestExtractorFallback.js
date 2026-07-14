// ──────────────────────────────────────────────────────────────────
// File:    VfsManifestExtractorFallback.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Distributed from _variances to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-14 04:55 UTC
"use strict";

const fs   = require("fs");
const path = require("path");

const PREVIEW_CHARS  = 500;
const MAX_READ_BYTES = 1024 * 256;

class VfsManifestExtractorFallback {
    static MANIFEST = {
        id:           "VfsManifestExtractorFallback.service",
        type:         "service",
        layer:        3,
        runtime:      "NodeJS",
        version:      "5.0.1",
        capabilities: ["vfs:extract-manifest-fallback"],
        dependencies: [],
        docs: {
            description: "Pure-JS VFS manifest extractor. Reads file metadata and generates type-aware purpose previews (code, document, data, image, audio, video) when the native C++ extractor is unavailable.",
            author: "ProtoAI team",
        },
        last_modified: "2026-07-13T00:00:00Z",
    };

    extract(realPath, type) {
        const stat = _safeStat(realPath);
        if (!stat) return _errorManifest(realPath, "File not accessible");

        const base = {
            id: null, realPath, type, generatedAt: new Date().toISOString(),
            meta: { size: stat.size, modified: stat.mtime.toISOString(), ext: path.extname(realPath).toLowerCase(), name: path.basename(realPath) },
            purpose: {}
        };

        try {
            const m = { code: "_extractCode", document: "_extractDocument", data: "_extractData", image: "_extractImage", audio: "_extractAudio", video: "_extractVideo" };
            base.purpose = this[m[type] || "_extractGeneric"](realPath);
        } catch (err) {
            base.purpose = { error: err.message, preview: _safePreview(realPath) };
        }
        return base;
    }

    _extractCode(filePath) {
        const content = _safeRead(filePath);
        if (!content) return { error: "Could not read file" };
        const ext = path.extname(filePath).toLowerCase(), lines = content.split("\n");
        const purpose = { language: _languageFromExt(ext), lineCount: lines.length, preview: content.slice(0, PREVIEW_CHARS) };

        const exports_ = [], esRe = /export\s+(?:default\s+)?(?:class|function|const|let|var|async function)\s+(\w+)/g, cjsRe = /(?:module\.exports\s*=\s*(\w+)|exports\.(\w+)\s*=)/g;
        let m;
        while ((m = esRe.exec(content)) !== null) exports_.push(m[1]);
        while ((m = cjsRe.exec(content)) !== null) exports_.push(m[1] || m[2]);
        if (exports_.length) purpose.exports = [...new Set(exports_)];

        const imports = [], esImp = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g, cjsImp = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((m = esImp.exec(content)) !== null) imports.push(m[1]);
        while ((m = cjsImp.exec(content)) !== null) imports.push(m[1]);
        if (imports.length) purpose.imports = [...new Set(imports)];

        const functions = [], fnRe = /(?:async\s+)?function\s+(\w+)\s*\(|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/g;
        while ((m = fnRe.exec(content)) !== null) functions.push(m[1] || m[2]);
        if (functions.length) purpose.functions = [...new Set(functions)].slice(0, 20);

        const classes = [], classRe = /class\s+(\w+)/g;
        while ((m = classRe.exec(content)) !== null) classes.push(m[1]);
        if (classes.length) purpose.classes = [...new Set(classes)];

        const sdoaM = /MANIFEST\s*=\s*\{[\s\S]*?id\s*:\s*['"]([^'"]+)['"][\s\S]*?version\s*:\s*['"]([^'"]+)['"]/.exec(content);
        if (sdoaM) purpose.sdoa = { id: sdoaM[1], version: sdoaM[2] };

        const commentM = /\/\*\*?([\s\S]*?)\*\/|\/\/\s*={3,}\s*\n([\s\S]*?)\/\/\s*={3,}/.exec(content);
        if (commentM) {
            const raw = (commentM[1] || commentM[2] || "").replace(/\s*\*\s*/g, " ").trim();
            if (raw.length > 10) purpose.summary = raw.slice(0, 200);
        }
        return purpose;
    }

    _extractDocument(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== ".md" && ext !== ".txt" && ext !== ".rtf") return { format: ext.slice(1).toUpperCase(), note: "Binary document — open file to read contents", preview: null };
        const content = _safeRead(filePath);
        if (!content) return { error: "Could not read file" };
        const lines = content.split("\n"), words = content.match(/\S+/g)?.length || 0;
        const sections = lines.filter(l => l.startsWith("#")).map(l => l.replace(/^#+\s*/, "").trim());
        return { title: sections[0] || path.basename(filePath, ext), wordCount: words, lineCount: lines.length, sections: sections.slice(0, 10), preview: content.slice(0, PREVIEW_CHARS) };
    }

    _extractData(filePath) {
        const ext = path.extname(filePath).toLowerCase(), content = _safeRead(filePath);
        if (!content) return { error: "Could not read file" };

        if (ext === ".csv" || ext === ".tsv") {
            const sep = ext === ".tsv" ? "\t" : ",", lines = content.split("\n").filter(Boolean);
            const fields = lines[0]?.split(sep).map(f => f.trim().replace(/^["']|["']$/g, "")) || [];
            const sample = lines[1]?.split(sep).map(f => f.trim().replace(/^["']|["']$/g, "")) || [];
            return { format: ext === ".tsv" ? "TSV" : "CSV", rowCount: Math.max(0, lines.length - 1), fieldCount: fields.length, fields, sampleRow: Object.fromEntries(fields.map((f, i) => [f, sample[i] || ""])) };
        }

        if (ext === ".json" || ext === ".jsonl") {
            try {
                const parsed = JSON.parse(content.slice(0, MAX_READ_BYTES));
                if (Array.isArray(parsed)) return { format: "JSON array", length: parsed.length, schema: parsed[0] ? Object.keys(parsed[0]) : [], preview: content.slice(0, PREVIEW_CHARS) };
                return { format: "JSON object", keys: Object.keys(parsed).slice(0, 20), preview: content.slice(0, PREVIEW_CHARS) };
            } catch {
                return { format: "JSON", error: "Parse failed", preview: content.slice(0, PREVIEW_CHARS) };
            }
        }
        if (ext === ".yaml" || ext === ".yml") {
            return { format: "YAML", topLevelKeys: content.match(/^[\w-]+:/gm)?.map(k => k.replace(":", "")) || [], preview: content.slice(0, PREVIEW_CHARS) };
        }
        return { format: ext.slice(1).toUpperCase(), preview: content.slice(0, PREVIEW_CHARS) };
    }

    _extractImage(filePath) {
        const ext = path.extname(filePath).toLowerCase(), stat = _safeStat(filePath);
        const result = { format: ext.slice(1).toUpperCase(), size: stat?.size };
        try {
            const buf = fs.readFileSync(filePath);
            if (ext === ".png" && buf.length > 24) {
                result.width = buf.readUInt32BE(16); result.height = buf.readUInt32BE(20);
            } else if ((ext === ".jpg" || ext === ".jpeg") && buf.length > 4) {
                const dims = _jpegDimensions(buf);
                if (dims) { result.width = dims.width; result.height = dims.height; }
            } else if (ext === ".svg") {
                const content = buf.toString("utf8", 0, Math.min(buf.length, 2048));
                const wM = /width=["']([^"']+)["']/.exec(content), hM = /height=["']([^"']+)["']/.exec(content);
                if (wM) result.width = wM[1]; if (hM) result.height = hM[1];
            }
        } catch {}
        return result;
    }

    _extractAudio(filePath) {
        const ext = path.extname(filePath).toLowerCase(), stat = _safeStat(filePath);
        const result = { format: ext.slice(1).toUpperCase(), size: stat?.size };
        if (ext === ".mp3" && stat) {
            try {
                const id3buf = Buffer.alloc(128), fd = fs.openSync(filePath, "r");
                fs.readSync(fd, id3buf, 0, 128, Math.max(0, stat.size - 128)); fs.closeSync(fd);
                if (id3buf.slice(0, 3).toString() === "TAG") {
                    const tag = (b, s, l) => id3buf.slice(s, s + l).toString("latin1").replace(/\0/g, "").trim();
                    result.title = tag(id3buf, 3, 30) || undefined;
                    result.artist = tag(id3buf, 33, 30) || undefined;
                    result.album = tag(id3buf, 63, 30) || undefined;
                    result.year = tag(id3buf, 93, 4) || undefined;
                }
            } catch {}
        }
        return result;
    }

    _extractVideo(filePath) { return { format: path.extname(filePath).slice(1).toUpperCase(), size: _safeStat(filePath)?.size, note: "Install ffprobe for duration/resolution extraction" }; }
    _extractGeneric(filePath) { return { preview: _safePreview(filePath) }; }
}

function _safeStat(filePath) { try { return fs.statSync(filePath); } catch { return null; } }
function _safePreview(filePath) { const content = _safeRead(filePath); return content ? content.slice(0, PREVIEW_CHARS) : null; }
function _errorManifest(realPath, error) { return { realPath, error, generatedAt: new Date().toISOString(), purpose: {} }; }

function _safeRead(filePath) {
    try {
        const stat = fs.statSync(filePath);
        if (stat.size <= MAX_READ_BYTES) return fs.readFileSync(filePath, "utf8");
        const buf = Buffer.alloc(MAX_READ_BYTES), fd = fs.openSync(filePath, "r");
        fs.readSync(fd, buf, 0, MAX_READ_BYTES, 0); fs.closeSync(fd);
        return buf.toString("utf8");
    } catch { return null; }
}

function _languageFromExt(ext) {
    const map = { ".js": "JavaScript", ".ts": "TypeScript", ".jsx": "React JSX", ".tsx": "React TSX", ".py": "Python", ".rs": "Rust", ".go": "Go", ".java": "Java", ".cs": "C#", ".cpp": "C++", ".c": "C", ".rb": "Ruby", ".php": "PHP", ".swift": "Swift", ".kt": "Kotlin", ".sh": "Shell", ".html": "HTML", ".css": "CSS", ".scss": "SCSS", ".md": "Markdown" };
    return map[ext] || ext.replace(".", "").toUpperCase();
}

function _jpegDimensions(buf) {
    let i = 2;
    while (i < buf.length) {
        if (buf[i] !== 0xFF) break;
        const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
        if (marker >= 0xC0 && marker <= 0xC3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + len;
    }
    return null;
}

module.exports = new VfsManifestExtractorFallback();
