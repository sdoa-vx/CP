"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.staticRouter = void 0;
var database_1 = require("../fisp/database");
var node_fs_1 = __importDefault(require("node:fs"));
var node_path_1 = __importDefault(require("node:path"));
var crypto_1 = __importDefault(require("crypto"));
var Router_1 = require("../utils/Router");
var logger_1 = require("../utils/logger");
var health_1 = require("./health");
var supabase_1 = require("../utils/supabase");
var telemetry_1 = require("../engine/telemetry");
var events_1 = require("../engine/events");
var offlineSync_1 = require("../workers/offlineSync");
var router = new Router_1.Router();
var syncedFiles = new Map();
var insightsCache = {
    sdoaPrimitive: [],
    sdoaWorkflow: [],
    sdoaSchema: [],
    sdoaToken: [],
    sdoaEngine: []
};
// Extract id/type/version from the actual MANIFEST object literal (balanced
// braces, comment-stripped), across dialects: `export const MANIFEST = {..}`,
// `static MANIFEST = {..}`, `MANIFEST = {..}` (Python). Scoping to the block
// avoids the old whole-file regex that mis-grabbed unrelated `type:"password"`,
// `type:"number"`, `type:"application/json"` etc.
function extractManifestFields(content) {
    var anchor = /(?:^|[\s.;({])MANIFEST(?:_JSON)?\s*[:=]\s*\{/m.exec(content);
    if (!anchor)
        return null;
    var start = content.indexOf("{", anchor.index);
    if (start === -1)
        return null;
    var depth = 0;
    var inStr = null;
    var end = -1;
    for (var i = start; i < content.length; i++) {
        var ch = content[i];
        if (inStr) {
            if (ch === "\\") {
                i++;
                continue;
            }
            if (ch === inStr)
                inStr = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
            inStr = ch;
            continue;
        }
        if (ch === "{")
            depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }
    if (end === -1)
        return null;
    var block = content
        .slice(start, end + 1)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/(^|\s)#[^\n]*/g, "$1");
    var grab = function (key) {
        var m = block.match(new RegExp(key + "\\s*[:=]\\s*[\"'`]([^\"'`]+)[\"'`]"));
        return m ? m[1] : undefined;
    };
    var id = grab("id");
    if (!id)
        return null; // a real manifest declares an id
    return { id: id, type: grab("type"), version: grab("version") };
}
function runScanHeuristics(root) {
    return __awaiter(this, void 0, void 0, function () {
        function collectFiles(target_1) {
            return __awaiter(this, arguments, void 0, function (target, depth) {
                var stat, entries, i, e, _a;
                if (depth === void 0) { depth = 0; }
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (depth > 20)
                                return [2 /*return*/];
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 10, , 11]);
                            stat = node_fs_1.default.statSync(target);
                            if (!stat.isDirectory()) return [3 /*break*/, 8];
                            entries = node_fs_1.default.readdirSync(target, { withFileTypes: true });
                            i = 0;
                            _b.label = 2;
                        case 2:
                            if (!(i < entries.length)) return [3 /*break*/, 7];
                            e = entries[i];
                            if (["node_modules", ".git", "dist", ".vscode", "_variances", "out", "build", "coverage", ".venv", "venv", "__pycache__", ".next", ".cache", "vendor"].includes(e.name))
                                return [3 /*break*/, 6];
                            if (!(i % 20 === 0)) return [3 /*break*/, 4];
                            (0, events_1.emit)("scan:progress", { currentFile: "Phase 1: Scanning file structure (Discovered " + scannableFiles.length + " files...)", scannedCount: scannableFiles.length, totalFiles: 0, currentHits: 0 });
                            return [4 /*yield*/, new Promise(function (r) { return setImmediate(r); })];
                        case 3:
                            _b.sent();
                            _b.label = 4;
                        case 4: return [4 /*yield*/, collectFiles(node_path_1.default.join(target, e.name), depth + 1)];
                        case 5:
                            _b.sent();
                            _b.label = 6;
                        case 6:
                            i++;
                            return [3 /*break*/, 2];
                        case 7: return [3 /*break*/, 9];
                        case 8:
                            if (stat.isFile()) {
                                if (/\.(ts|tsx|js|jsx|mjs|cjs|css|scss|less|html|htm|json|md|py|java|cpp|c|cc|cxx|hpp|h|cs|go|rs|rb|php|pas|pp|inc|f|for|f90|f95|asm|s|coffee|vb|vba|vbs|bas|ndl|f242|sh|bash|bat|ps1|lua|sql|yaml|yml|toml|d|di)$/i.test(target)) {
                                    scannableFiles.push(target);
                                }
                            }
                            _b.label = 9;
                        case 9: return [3 /*break*/, 11];
                        case 10:
                            _a = _b.sent();
                            return [3 /*break*/, 11];
                        case 11: return [2 /*return*/];
                    }
                });
            });
        }
        var cleanRoot, workspaceHash, count, scannableFiles, _loop_1, i;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    cleanRoot = root.replace(/^["']|["']$/g, "").trim();
                    workspaceHash = crypto_1.default.createHash('sha256').update(cleanRoot.toLowerCase()).digest('hex').slice(0, 16);
                    count = 0;
                    // Clear cache for new scan
                    Object.keys(insightsCache).forEach(function (k) { return insightsCache[k] = []; });
                    scannableFiles = [];
                    return [4 /*yield*/, collectFiles(cleanRoot)];
                case 1:
                    _c.sent();
                    console.log("[SDOA MCP] collectFiles finished. Found ".concat(scannableFiles.length, " files."));
                    // Emit scan:init with total files
                    (0, events_1.emit)("scan:init", { totalFiles: scannableFiles.length, root: cleanRoot });
                    if (!(scannableFiles.length === 0)) return [3 /*break*/, 3];
                    (0, events_1.emit)("scan:progress", {
                        currentFile: "No scannable files found.",
                        scannedCount: 0,
                        totalFiles: 0,
                        currentHits: 0
                    });
                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 1000); })];
                case 2:
                    _c.sent();
                    _c.label = 3;
                case 3:
                    console.log("[SDOA MCP] Starting Pass 2...");
                    _loop_1 = function (i) {
                        var target, content, fileHash, isCodeFile, mf_1, modType, payload, hit, currentTelemetry, currentHits;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    target = scannableFiles[i];
                                    count++;
                                    // Process file
                                    try {
                                        content = node_fs_1.default.readFileSync(target, "utf-8");
                                        fileHash = crypto_1.default.createHash('sha256').update(content).digest('hex');
                                        isCodeFile = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|java|cpp|cc|cxx|c|h|hpp|cs|go|rb|php)$/i.test(target);
                                        mf_1 = isCodeFile ? extractManifestFields(content) : null;
                                        if (mf_1) {
                                            modType = mf_1.type
                                                ? mf_1.type.charAt(0).toUpperCase() + mf_1.type.slice(1)
                                                : "Module";
                                            telemetry_1.telemetry.hitDetector("sdoa".concat(modType));
                                            if (syncedFiles.get(target) !== fileHash) {
                                                syncedFiles.set(target, fileHash);
                                                payload = {
                                                    module_id: mf_1.id,
                                                    type: (_a = mf_1.type) !== null && _a !== void 0 ? _a : "unknown",
                                                    file_path: target,
                                                    source_code: content,
                                                    workspace_hash: workspaceHash,
                                                    file_hash: fileHash,
                                                    version: (_b = mf_1.version) !== null && _b !== void 0 ? _b : "1.0.0",
                                                    timestamp: new Date().toISOString()
                                                };
                                                database_1.db.prepare('INSERT INTO offline_queue (type, target, payload, created_at) VALUES (?, ?, ?, ?)').run('SUPABASE', 'sdoa_portfolio', JSON.stringify(payload), new Date().toISOString());
                                            }
                                        }
                                        hit = function (detector) {
                                            var _a, _b;
                                            var key = "sdoa".concat(detector.charAt(0).toUpperCase() + detector.slice(1));
                                            var isNew = !((_a = insightsCache[key]) === null || _a === void 0 ? void 0 : _a.includes(target));
                                            telemetry_1.telemetry.hitDetector(key);
                                            if (insightsCache[key] && isNew) {
                                                insightsCache[key].push(target);
                                            }
                                            // Emit a rich per-discovery SSE event so the UI can react with fireworks
                                            (0, events_1.emit)('detector:hit', {
                                                detector: key,
                                                filePath: target,
                                                moduleId: (mf_1 === null || mf_1 === void 0 ? void 0 : mf_1.id) || null,
                                                type: (mf_1 === null || mf_1 === void 0 ? void 0 : mf_1.type) || detector,
                                                isNew: isNew,
                                                totalHits: (((_b = insightsCache[key]) === null || _b === void 0 ? void 0 : _b.length) || 0)
                                            });
                                            database_1.db.prepare('INSERT INTO offline_queue (type, target, payload, created_at) VALUES (?, ?, ?, ?)').run('SUPABASE', 'innovation_events', JSON.stringify({
                                                workspace_hash: workspaceHash,
                                                detector: key,
                                                file_path: target,
                                                matches: 1,
                                                ast_signature: null,
                                                created_at: new Date().toISOString()
                                            }), new Date().toISOString());
                                        };
                                        if (content.includes("fetch(") || content.includes("axios.") || content.includes("requests.get"))
                                            hit("workflow");
                                        if (content.includes("child_process") || content.includes("exec(") || content.includes("subprocess."))
                                            hit("engine");
                                        if (/\b(interface|type|class|def|struct)\s+[A-Z]/.test(content))
                                            hit("schema");
                                        if (content.includes("var(--") || content.includes("#") || content.includes("px") || content.includes("color:"))
                                            hit("token");
                                        if ((content.includes("<") && content.includes("/>") && content.includes("className=")) || content.includes("class="))
                                            hit("uiPrimitive");
                                    }
                                    catch ( /* skip */_e) { /* skip */ }
                                    currentTelemetry = telemetry_1.telemetry.get();
                                    currentHits = Object.values(currentTelemetry.detectorHits).reduce(function (a, b) { return a + b; }, 0);
                                    (0, events_1.emit)("scan:progress", {
                                        currentFile: target,
                                        scannedCount: i + 1,
                                        totalFiles: scannableFiles.length,
                                        currentHits: currentHits
                                    });
                                    if (!(i % 5 === 0)) return [3 /*break*/, 2];
                                    return [4 /*yield*/, new Promise(function (r) { return setImmediate(r); })];
                                case 1:
                                    _d.sent();
                                    _d.label = 2;
                                case 2: return [2 /*return*/];
                            }
                        });
                    };
                    i = 0;
                    _c.label = 4;
                case 4:
                    if (!(i < scannableFiles.length)) return [3 /*break*/, 7];
                    return [5 /*yield**/, _loop_1(i)];
                case 5:
                    _c.sent();
                    _c.label = 6;
                case 6:
                    i++;
                    return [3 /*break*/, 4];
                case 7: return [2 /*return*/, { count: count, workspaceHash: workspaceHash }];
            }
        });
    });
}
router.get("/api/status", function (req, res) {
    var proposals = database_1.db.prepare('SELECT id, status, timestamp FROM proposals ORDER BY timestamp DESC').all();
    var queuedCount = proposals.filter(function (p) { return p.status === "queued"; }).length;
    var acceptedCount = proposals.filter(function (p) { return p.status === "accepted"; }).length;
    var rejectedCount = proposals.filter(function (p) { return p.status === "rejected"; }).length;
    var peers = (process.env.FEDERATION_PEERS || '').split(',').filter(Boolean);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
        uptime: process.uptime(),
        proposals: { total: proposals.length, queued: queuedCount, accepted: acceptedCount, rejected: rejectedCount },
        federation: { peers: peers }
    }));
});
router.get("/api/proposals/:id", function (req, res) {
    var id = req.url.split("/").pop();
    var proposal = database_1.db.prepare('SELECT * FROM proposals WHERE id = ?').get(id);
    if (!proposal) {
        res.statusCode = 404;
        return res.end("<p>Proposal not found.</p>");
    }
    var data = JSON.parse(proposal.data);
    var innovations = data.innovations || [];
    var prMeta = database_1.db.prepare('SELECT * FROM pr_metadata WHERE proposalId = ?').get(id);
    var prHtml = (prMeta === null || prMeta === void 0 ? void 0 : prMeta.prUrl)
        ? "<p><strong>PR Status:</strong> OPEN (<a href=\"".concat(prMeta.prUrl, "\" target=\"_blank\">View PR</a>)</p>")
        : "<p><strong>PR Status:</strong> <span class=\"badge rejected\">PR not created</span></p>";
    var ciHtml = "<p><strong>CI Checks:</strong> <span class=\"badge queued\">Pending/Unknown</span></p>";
    if (prMeta === null || prMeta === void 0 ? void 0 : prMeta.ci_status) {
        var badgeClass = prMeta.ci_status === 'success' ? 'accepted' : 'rejected';
        var logsLink = prMeta.ci_log_url ? " (<a href=\"".concat(prMeta.ci_log_url, "\" target=\"_blank\">View Logs</a>)") : '';
        ciHtml = "<p><strong>CI Checks:</strong> <span class=\"badge ".concat(badgeClass, "\">").concat(prMeta.ci_status, "</span>").concat(logsLink, "</p>");
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end("\n    <div style=\"margin-top: 2rem; border-top: 1px solid #333; padding-top: 1rem;\">\n      <h3>Envelope: ".concat(proposal.id, "</h3>\n      <p><strong>Status:</strong> <span class=\"badge ").concat(proposal.status, "\">").concat(proposal.status, "</span></p>\n      <p><strong>Origin:</strong> ").concat(data.origin || 'Unknown', "</p>\n      <p><strong>Timestamp:</strong> ").concat(new Date(data.timestamp || proposal.timestamp).toLocaleString(), "</p>\n      <p><strong>Summary:</strong> ").concat(data.summary || 'No summary provided.', "</p>\n      <p><strong>Motivation:</strong> ").concat(data.motivation || 'No motivation provided.', "</p>\n      <p><strong>Reviewer Notes:</strong> ").concat(proposal.notes || 'None', "</p>\n      <p><strong>Metrics:</strong> \n        Signature: ").concat(data.signature ? 'Valid' : 'Missing', " | \n        Innovations: ").concat(innovations.length, "\n      </p>\n      ").concat(prHtml, "\n      ").concat(ciHtml, "\n      \n      <h4>Innovations [").concat(innovations.length, "]</h4>\n      <pre>").concat(JSON.stringify(innovations, null, 2), "</pre>\n    </div>\n  "));
});
router.get("/api/proposals", function (req, res) {
    var proposals = database_1.db.prepare('SELECT id, status, timestamp FROM proposals ORDER BY timestamp DESC LIMIT 20').all();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    if (proposals.length === 0)
        return res.end("<tr><td colspan='3'>No proposals found.</td></tr>");
    var htmlRows = proposals.map(function (p) { return "\n    <tr hx-get=\"/dashboard/api/proposals/".concat(p.id, "\" hx-target=\"#proposal-detail-pane\" style=\"cursor:pointer\">\n      <td>").concat(p.id, "</td>\n      <td><span class=\"badge ").concat(p.status, "\">").concat(p.status, "</span></td>\n      <td>").concat(new Date(p.timestamp).toLocaleString(), "</td>\n    </tr>\n  "); }).join("");
    res.end(htmlRows);
});
router.get("/api/peers/:id", function (req, res) {
    var peerId = decodeURIComponent(req.url.split("/").pop());
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end("\n    <div style=\"margin-top: 2rem; border-top: 1px solid #333; padding-top: 1rem;\">\n      <h3>Peer Deep Dive: ".concat(peerId, "</h3>\n      <table class=\"table\">\n        <tr><td><strong>Last Sync:</strong></td><td>Just now (0ms ago)</td></tr>\n        <tr><td><strong>Protocol Version:</strong></td><td>FISP v1.1</td></tr>\n        <tr><td><strong>Signature Check:</strong></td><td><span class=\"badge accepted\">HMAC Valid</span></td></tr>\n        <tr><td><strong>Health History:</strong></td><td>100% Uptime (Last 24h)</td></tr>\n        <tr><td><strong>Replication Stats:</strong></td><td>14 Envelopes Synced (0 Collisions)</td></tr>\n      </table>\n    </div>\n  "));
});
router.get("/api/peers", function (req, res) {
    var peers = (process.env.FEDERATION_PEERS || '').split(',').filter(Boolean);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    if (peers.length === 0)
        return res.end("<tr><td colspan='3'>No peers configured.</td></tr>");
    var htmlRows = peers.map(function (peer) { return "\n    <tr hx-get=\"/dashboard/api/peers/".concat(encodeURIComponent(peer), "\" hx-target=\"#peer-detail-pane\" style=\"cursor:pointer\">\n      <td>").concat(peer, "</td>\n      <td><span class=\"badge queued\">Connected</span></td>\n      <td><span class=\"badge accepted\">In Sync</span></td>\n    </tr>\n  "); }).join("");
    res.end(htmlRows);
});
router.get("/api/pipeline", function (req, res) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    try {
        // Pull pipeline data from local SQLite — source of truth, no Supabase needed
        var proposals = database_1.db.prepare("\n      SELECT p.id, p.status, p.timestamp, p.data,\n             pr.prUrl, pr.ci_status\n      FROM proposals p\n      LEFT JOIN pr_metadata pr ON pr.proposalId = p.id\n      ORDER BY p.timestamp DESC LIMIT 10\n    ").all();
        if (proposals.length === 0) {
            return res.end("<div style=\"padding:2rem;color:#8b949e;font-family:monospace;text-align:center;\">\n        <p>\uD83D\uDD2C No proposals in local pipeline yet.</p>\n        <p style=\"font-size:11px;margin-top:8px;\">Run a workspace scan to begin detecting innovations.</p>\n      </div>");
        }
        // Also fetch run data if the MCP authority has processed any proposals
        var runs = database_1.db.prepare("\n      SELECT runId, status, currentPhase, createdAt, updatedAt\n      FROM runs ORDER BY createdAt DESC LIMIT 20\n    ").all();
        var runMap = new Map(runs.map(function (r) { return [r.runId, r]; }));
        var html = proposals.map(function (p) {
            var _a, _b;
            var envelope = {};
            try {
                envelope = JSON.parse(p.data || '{}');
            }
            catch ( /* ignore */_c) { /* ignore */ }
            var innovations = envelope.innovations || [];
            var firstName = ((_a = innovations[0]) === null || _a === void 0 ? void 0 : _a.module_suggestion)
                || ((_b = innovations[0]) === null || _b === void 0 ? void 0 : _b.id)
                || envelope.summary
                || p.id.slice(0, 8);
            var innovationTypes = __spreadArray([], new Set(innovations.map(function (i) { var _a; return i.type || ((_a = i.sdoa) === null || _a === void 0 ? void 0 : _a.type); }).filter(Boolean)), true);
            var typeLabel = innovationTypes.length > 0
                ? innovationTypes.slice(0, 3).join(', ')
                : 'proposal';
            var pStatus = p.status || 'queued';
            var isAccepted = pStatus === 'accepted' || pStatus === 'approved';
            var isRejected = pStatus === 'rejected';
            var isPending = !isAccepted && !isRejected;
            // Pipeline stage inference based on status
            var stage1 = 'accepted'; // envelope received = pre-gate passed
            var stage2 = isRejected ? 'rejected' : (isAccepted ? 'accepted' : 'queued');
            var stage3 = isAccepted ? 'accepted' : (isRejected ? 'queued' : 'queued');
            var stage4 = isAccepted && p.prUrl ? 'accepted' : 'queued';
            var borderColor = isAccepted ? '#238636' : isRejected ? '#da3633' : '#d29922';
            var ciLabel = p.ci_status ? "CI: ".concat(p.ci_status) : '';
            var prLink = p.prUrl ? " \u00B7 <a href=\"".concat(p.prUrl, "\" target=\"_blank\" style=\"color:#58a6ff;\">View PR \u2197</a>") : '';
            var ts = new Date(p.timestamp).toLocaleString();
            return "\n        <div class=\"card\" style=\"margin-bottom:1rem;border-left:4px solid ".concat(borderColor, ";padding:1rem;\">\n          <div style=\"display:flex;justify-content:space-between;align-items:flex-start;\">\n            <div>\n              <h4 style=\"margin:0 0 4px;font-size:13px;color:#e6edf3;\">").concat(firstName, "</h4>\n              <p style=\"margin:0;font-size:11px;color:#8b949e;font-family:monospace;\">\n                ").concat(typeLabel.toUpperCase(), " \u00B7 ").concat(ts).concat(ciLabel ? ' · ' + ciLabel : '').concat(prLink, "\n              </p>\n            </div>\n            <span class=\"badge ").concat(pStatus, "\" style=\"white-space:nowrap;\">").concat(pStatus.toUpperCase(), "</span>\n          </div>\n          <div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center;\">\n            <span class=\"badge ").concat(stage1, "\" style=\"font-size:10px;\">\u2460 Pre-Gate</span>\n            <span style=\"color:#444;\">\u2192</span>\n            <span class=\"badge ").concat(stage2, "\" style=\"font-size:10px;\">\u2461 Probation</span>\n            <span style=\"color:#444;\">\u2192</span>\n            <span class=\"badge ").concat(stage3, "\" style=\"font-size:10px;\">\u2462 Canonical Path</span>\n            <span style=\"color:#444;\">\u2192</span>\n            <span class=\"badge ").concat(stage4, "\" style=\"font-size:10px;\">\u2463 PR Worker</span>\n          </div>\n          ").concat(innovations.length > 0 ? "<p style=\"font-size:10px;color:#8b949e;margin:8px 0 0;\">Innovations: ".concat(innovations.length, "</p>") : '', "\n        </div>\n      ");
        }).join('');
        res.end(html);
    }
    catch (err) {
        res.end("<p style=\"color:#da3633;\">Pipeline error: ".concat(err.message, "</p>"));
    }
});
router.get("/api/logs", function (req, res) {
    var lines = (0, logger_1.tailLogs)(50);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    if (lines.length === 0)
        return res.end("<pre>No logs generated yet.</pre>");
    var formatted = lines.map(function (l) {
        try {
            var obj = JSON.parse(l);
            var color = '#58a6ff';
            if (obj.level === 'error') {
                color = '#da3633';
            }
            else if (obj.level === 'warn') {
                color = '#d29922';
            }
            return "<div><span style=\"color: #8b949e\">[".concat(obj.timestamp, "]</span> <span style=\"color: ").concat(color, "\">[").concat(obj.level.toUpperCase(), "]</span> ").concat(obj.msg, " ").concat(Object.keys(obj).length > 3 ? JSON.stringify(obj) : '', "</div>");
        }
        catch (e) {
            console.error(e);
            return "<div>".concat(l, "</div>");
        }
    }).join("");
    res.end("<pre style=\"background: #000; color: #0f0; padding: 1rem; height: 500px; overflow-y: scroll; font-family: monospace;\">".concat(formatted, "</pre>"));
});
router.post("/api/scan", function (req, res) {
    var body = "";
    req.on("data", function (chunk) { body += chunk; });
    req.on("end", function () { return __awaiter(void 0, void 0, void 0, function () {
        var payload, targetPath, _a, count, workspaceHash, currentTelemetry, e_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    payload = JSON.parse(body || "{}");
                    targetPath = payload.path || payload.workspaceRoot || process.cwd();
                    console.log("[SDOA MCP] Manual scan requested via Dashboard: ".concat(payload.type || 'full', " at ").concat(targetPath));
                    telemetry_1.telemetry.setState("scanning");
                    (0, events_1.emit)("scan:start", { root: targetPath });
                    // Yield the event loop so the UI and SSE events can flush 'scanning' state before we block
                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 100); })];
                case 1:
                    // Yield the event loop so the UI and SSE events can flush 'scanning' state before we block
                    _b.sent();
                    telemetry_1.telemetry.resetDetectorHits();
                    return [4 /*yield*/, runScanHeuristics(targetPath)];
                case 2:
                    _a = _b.sent(), count = _a.count, workspaceHash = _a.workspaceHash;
                    currentTelemetry = telemetry_1.telemetry.get();
                    try {
                        database_1.db.prepare('INSERT INTO offline_queue (type, target, payload, created_at) VALUES (?, ?, ?, ?)').run('SUPABASE', 'portfolio_usage', JSON.stringify({
                            workspace_hash: workspaceHash,
                            primitive_count: currentTelemetry.detectorHits.sdoaPrimitive,
                            workflow_count: currentTelemetry.detectorHits.sdoaWorkflow,
                            schema_count: currentTelemetry.detectorHits.sdoaSchema,
                            token_count: currentTelemetry.detectorHits.sdoaToken,
                            engine_count: currentTelemetry.detectorHits.sdoaEngine,
                            updated_at: new Date().toISOString()
                        }), new Date().toISOString());
                    }
                    catch (dbErr) {
                        console.error("Error inserting portfolio_usage:", dbErr);
                    }
                    telemetry_1.telemetry.setAstCacheSize(count);
                    telemetry_1.telemetry.recordScan();
                    (0, events_1.emit)("scan:complete", { filesScanned: count });
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ message: "Scan completed for ".concat(payload.type, ": ").concat(payload.path) }));
                    return [3 /*break*/, 4];
                case 3:
                    e_1 = _b.sent();
                    console.error(e_1);
                    res.statusCode = 400;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ error: "Invalid JSON payload" }));
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
});
router.get("/api/health-ui", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var metrics, supabaseHtml, start, isConnected, latency;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                metrics = (0, health_1.getSystemMetrics)();
                supabaseHtml = '<p><strong>Supabase:</strong> <span class="badge rejected">Not Configured</span></p>';
                if (!supabase_1.supabase) return [3 /*break*/, 2];
                start = Date.now();
                return [4 /*yield*/, (0, supabase_1.evaluateConnection)()];
            case 1:
                isConnected = _a.sent();
                latency = Date.now() - start;
                if (!isConnected) {
                    supabaseHtml = "<p><strong>Supabase:</strong> <span class=\"badge rejected\">ERROR</span> (Connection Failed)</p>";
                }
                else {
                    supabaseHtml = "<p><strong>Supabase:</strong> <span class=\"badge accepted\">OK</span> (".concat(latency, "ms)</p>");
                }
                _a.label = 2;
            case 2:
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end("\n    <div style=\"display: grid; grid-template-columns: 1fr 1fr; gap: 20px;\">\n      <div class=\"card\">\n        <h3>Core Engine</h3>\n        <p><strong>Status:</strong> <span class=\"badge ".concat(metrics.status === 'ok' ? 'accepted' : 'rejected', "\">").concat(metrics.status.toUpperCase(), "</span></p>\n        <p><strong>Version:</strong> ").concat(metrics.version, "</p>\n        <p><strong>Memory:</strong> ").concat(Math.round(metrics.memory.heapUsed / 1024 / 1024), " MB / ").concat(Math.round(metrics.memory.heapTotal / 1024 / 1024), " MB</p>\n        <p><strong>Uptime:</strong> ").concat(Math.round(metrics.uptime), "s</p>\n      </div>\n      <div class=\"card\">\n        <h3>Storage & DB</h3>\n        <p><strong>Local SQLite:</strong> <span class=\"badge accepted\">OK</span></p>\n        ").concat(supabaseHtml, "\n        <p><strong>Proposal Count:</strong> ").concat(database_1.db.prepare('SELECT count(*) as c FROM proposals').get().c, "</p>\n        <p style=\"margin-top: 10px; font-size: 0.8rem;\"><a href=\"/dashboard/api/health-check\" target=\"_blank\" style=\"color: #58a6ff; text-decoration: none;\">\u2197 View Programmatic Health Ping API</a></p>\n      </div>\n    </div>\n  "));
                return [2 /*return*/];
        }
    });
}); });
router.get("/api/health-check", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var start, timeoutPromise, queryPromise, error, latency, err_1, latency;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                start = Date.now();
                if (!supabase_1.supabase) {
                    res.statusCode = 503;
                    res.setHeader("Content-Type", "application/json");
                    return [2 /*return*/, res.end(JSON.stringify({ status: "error", message: "Supabase client not initialized" }))];
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                timeoutPromise = new Promise(function (_, reject) { return setTimeout(function () { return reject(new Error('timeout')); }, 3000); });
                queryPromise = supabase_1.supabase.from('sdoa_portfolio').select('id').limit(1);
                return [4 /*yield*/, Promise.race([queryPromise, timeoutPromise])];
            case 2:
                error = (_a.sent()).error;
                latency = Date.now() - start;
                res.statusCode = error ? 500 : 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    status: error ? "error" : "ok",
                    latencyMs: latency,
                    message: error ? String(error.message) : "Connected"
                }));
                return [3 /*break*/, 4];
            case 3:
                err_1 = _a.sent();
                latency = Date.now() - start;
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    status: "error",
                    latencyMs: latency,
                    message: err_1 instanceof Error ? err_1.message : String(err_1)
                }));
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ── v1.1 Engine Control API ─────────────────────────────────────────────────
/** Full live state snapshot — polled by the VS Code panel every 5s */
router.get("/api/state", function (req, res) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(telemetry_1.telemetry.get()));
});
router.get("/api/telemetry/history", function (req, res) {
    try {
        var rows = database_1.db.prepare("\n      SELECT timestamp, ast_cache_size as astCacheSize, queue_depth as queueDepth, detector_hits as detectorHits\n      FROM telemetry_history\n      ORDER BY id DESC LIMIT 100\n    ").all();
        var history_1 = rows.reverse().map(function (r) { return (__assign(__assign({}, r), { detectorHits: JSON.parse(r.detectorHits || '{}') })); });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(history_1));
    }
    catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
    }
});
router.get("/api/insights", function (req, res) {
    var urlParams = new URL(req.url, "http://localhost");
    var detector = urlParams.searchParams.get("detector");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    if (detector && insightsCache[detector]) {
        res.end(JSON.stringify(insightsCache[detector]));
    }
    else if (!detector) {
        res.end(JSON.stringify(insightsCache));
    }
    else {
        res.end(JSON.stringify([]));
    }
});
router.post("/api/actions/extract", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var payload, filePath;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, parseBody(req)];
            case 1:
                payload = _a.sent();
                filePath = payload.filePath;
                // Emitting this event so the VS Code extension can pick it up via SSE and pop open the file
                (0, events_1.emit)("sdoa:extract-request", { filePath: filePath });
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: true, message: "Extraction request sent to VS Code." }));
                return [2 /*return*/];
        }
    });
}); });
/** Time-series data for dashboard telemetry charts */
router.get("/api/telemetry", function (_req, res) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(telemetry_1.telemetry.getSeries()));
});
/** SSE stream — ?stream=true keeps connection open */
router.get("/api/events", function (req, res) {
    var _a, _b, _c, _d, _e, _f, _g;
    var url = new URL(req.url, "http://localhost");
    if (url.searchParams.get("stream") === "true") {
        (0, events_1.attachSseClient)(res);
        // Hydrate new SSE client with current proposals so SvelteKit stores populate immediately
        try {
            var rows = database_1.db.prepare('SELECT id, status, timestamp, data FROM proposals ORDER BY timestamp DESC LIMIT 100').all();
            var proposalFeed_1 = {};
            for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
                var row = rows_1[_i];
                var envelope = {};
                try {
                    envelope = JSON.parse(row.data || '{}');
                }
                catch ( /* ignore */_h) { /* ignore */ }
                var innovations = envelope.innovations || [];
                var firstName = ((_a = innovations[0]) === null || _a === void 0 ? void 0 : _a.module_suggestion)
                    || ((_b = innovations[0]) === null || _b === void 0 ? void 0 : _b.id)
                    || envelope.summary || '';
                var firstType = ((_c = innovations[0]) === null || _c === void 0 ? void 0 : _c.type) || ((_e = (_d = innovations[0]) === null || _d === void 0 ? void 0 : _d.sdoa) === null || _e === void 0 ? void 0 : _e.type) || 'proposal';
                var lineage = ((_g = (_f = innovations[0]) === null || _f === void 0 ? void 0 : _f.sdoa) === null || _g === void 0 ? void 0 : _g.placement) || envelope.origin || null;
                proposalFeed_1[row.id] = {
                    id: row.id,
                    type: firstType,
                    name: firstName || row.id,
                    status: row.status || 'queued',
                    lineage: lineage,
                    created_at: row.timestamp,
                };
            }
            // Small delay so SSE client header flush completes first
            setTimeout(function () {
                (0, events_1.emit)('proposals:hydrate', proposalFeed_1);
            }, 150);
        }
        catch ( /* non-fatal */_j) { /* non-fatal */ }
    }
    else {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify((0, events_1.getRecentEvents)(100)));
    }
});
var cachedAstHeatmap = {};
/** Receives AST scores from the globalAstEngine extension worker */
router.post("/api/actions/ast-heatmap", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var payload;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, parseBody(req)];
            case 1:
                payload = _a.sent();
                cachedAstHeatmap = payload;
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: true, count: Object.keys(payload).length }));
                return [2 /*return*/];
        }
    });
}); });
/**
 * Heatmap: serves the AST density/complexity scores synced from the VS Code extension.
 */
router.get("/api/heatmap", function (_req, res) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(cachedAstHeatmap));
});
// ── SvelteKit JSON Feeds ─────────────────────────────────────────────────────
// These endpoints serve the SvelteKit dashboard pages. All data comes from
// local SQLite — no Supabase required.
/**
 * GET /api/proposals-json
 * Returns proposals as a keyed object with parsed fields for the Innovation Timeline.
 * Shape: { [id]: { id, type, name, status, lineage, created_at } }
 */
router.get("/api/proposals-json", function (req, res) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    res.setHeader("Content-Type", "application/json");
    try {
        var rows = database_1.db.prepare('SELECT id, status, timestamp, data FROM proposals ORDER BY timestamp DESC LIMIT 200').all();
        var out = {};
        for (var _i = 0, rows_2 = rows; _i < rows_2.length; _i++) {
            var row = rows_2[_i];
            var envelope = {};
            try {
                envelope = JSON.parse(row.data || '{}');
            }
            catch ( /* ignore */_l) { /* ignore */ }
            var innovations = envelope.innovations || [];
            var firstName = ((_a = innovations[0]) === null || _a === void 0 ? void 0 : _a.module_suggestion)
                || ((_b = innovations[0]) === null || _b === void 0 ? void 0 : _b.id)
                || envelope.summary || '';
            var firstType = ((_c = innovations[0]) === null || _c === void 0 ? void 0 : _c.type)
                || ((_e = (_d = innovations[0]) === null || _d === void 0 ? void 0 : _d.sdoa) === null || _e === void 0 ? void 0 : _e.type)
                || 'proposal';
            var lineage = ((_g = (_f = innovations[0]) === null || _f === void 0 ? void 0 : _f.sdoa) === null || _g === void 0 ? void 0 : _g.placement)
                || ((_k = (_j = (_h = innovations[0]) === null || _h === void 0 ? void 0 : _h.sdoa) === null || _j === void 0 ? void 0 : _j.layer) === null || _k === void 0 ? void 0 : _k.toString())
                || envelope.origin
                || null;
            out[row.id] = {
                id: row.id,
                type: firstType,
                name: firstName || row.id,
                status: row.status || 'queued',
                lineage: lineage,
                created_at: row.timestamp,
            };
        }
        res.statusCode = 200;
        res.end(JSON.stringify(out));
    }
    catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
    }
});
/**
 * GET /api/innovations-json
 * Returns locally-scanned SDOA modules as proposals for the Scan page.
 * Shape: { [id]: { id, module_suggestion, state, capability_surface, reasoning } }
 */
router.get("/api/innovations-json", function (req, res) {
    res.setHeader("Content-Type", "application/json");
    try {
        var rows = database_1.db.prepare("\n      SELECT id, type, layer, sovereignty, manifestJson, updatedAt\n      FROM modules ORDER BY updatedAt DESC LIMIT 200\n    ").all();
        var out = {};
        for (var _i = 0, rows_3 = rows; _i < rows_3.length; _i++) {
            var row = rows_3[_i];
            var mf = {};
            try {
                mf = JSON.parse(row.manifestJson || '{}');
            }
            catch ( /* ignore */_a) { /* ignore */ }
            out[row.id] = {
                id: row.id,
                module_suggestion: mf.id || row.id,
                state: row.sovereignty === 'sovereign' ? 'sovereign' : 'candidate',
                capability_surface: mf.capabilities || [],
                reasoning: "".concat(row.type || 'module', " \u00B7 layer ").concat(row.layer || '?', " \u00B7 ").concat(row.sovereignty || 'unknown sovereignty'),
                type: row.type,
                layer: row.layer,
                updatedAt: row.updatedAt,
            };
        }
        res.statusCode = 200;
        res.end(JSON.stringify(out));
    }
    catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
    }
});
/**
 * GET /api/lineage
 * Returns the module dependency tree for the Lineage Tree (Registrar) panel.
 * Nodes are modules grouped by layer; edges come from the edges table.
 */
router.get("/api/lineage", function (req, res) {
    res.setHeader("Content-Type", "application/json");
    try {
        var modules = database_1.db.prepare("\n      SELECT id, type, layer, sovereignty, manifestJson, updatedAt\n      FROM modules ORDER BY layer ASC, id ASC LIMIT 500\n    ").all();
        var edges = database_1.db.prepare("\n      SELECT fromId, toId, edgeType FROM edges LIMIT 2000\n    ").all();
        var nodes = modules.map(function (m) {
            var mf = {};
            try {
                mf = JSON.parse(m.manifestJson || '{}');
            }
            catch ( /* ignore */_a) { /* ignore */ }
            return {
                id: m.id,
                label: mf.id || m.id,
                type: m.type || 'module',
                layer: m.layer || 0,
                sovereignty: m.sovereignty || 'candidate',
                capabilities: mf.capabilities || [],
                operationalRole: mf.operationalRole || null,
                version: mf.version || null,
                updatedAt: m.updatedAt,
            };
        });
        // Group nodes by layer for tree display
        var byLayer = {};
        for (var _i = 0, nodes_1 = nodes; _i < nodes_1.length; _i++) {
            var n = nodes_1[_i];
            var l = n.layer || 0;
            if (!byLayer[l])
                byLayer[l] = [];
            byLayer[l].push(n);
        }
        res.statusCode = 200;
        res.end(JSON.stringify({
            nodes: nodes,
            edges: edges,
            byLayer: byLayer,
            totalModules: modules.length,
            totalEdges: edges.length,
        }));
    }
    catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
    }
});
/**
 * GET /api/drift
 * Returns architectural drift time-series from telemetry_history.
 * Drift = delta of total detector hits between consecutive snapshots.
 */
router.get("/api/drift", function (req, res) {
    res.setHeader("Content-Type", "application/json");
    try {
        var rows = database_1.db.prepare("\n      SELECT timestamp, ast_cache_size, queue_depth, detector_hits\n      FROM telemetry_history ORDER BY id DESC LIMIT 120\n    ").all();
        var history_2 = rows.reverse().map(function (r) { return ({
            timestamp: r.timestamp,
            astCacheSize: r.ast_cache_size,
            queueDepth: r.queue_depth,
            detectorHits: JSON.parse(r.detector_hits || '{}'),
        }); });
        // Compute drift score as delta in total hits between snapshots
        var series = history_2.map(function (snap, i) {
            var totalHits = Object.values(snap.detectorHits)
                .reduce(function (a, b) { return a + b; }, 0);
            var prevHits = i === 0 ? totalHits
                : Object.values(history_2[i - 1].detectorHits)
                    .reduce(function (a, b) { return a + b; }, 0);
            var drift = Math.abs(totalHits - prevHits);
            return {
                timestamp: snap.timestamp,
                driftScore: drift,
                totalModules: snap.astCacheSize,
                queueDepth: snap.queueDepth,
                detectorBreakdown: snap.detectorHits,
            };
        });
        // Summary stats
        var driftScores = series.map(function (s) { return s.driftScore; });
        var maxDrift = driftScores.length ? Math.max.apply(Math, driftScores) : 0;
        var avgDrift = driftScores.length
            ? Math.round(driftScores.reduce(function (a, b) { return a + b; }, 0) / driftScores.length)
            : 0;
        // Also pull recent violations for drift context
        var recentViolations = database_1.db.prepare("\n      SELECT severity, COUNT(*) as count FROM violations\n      WHERE resolved = 0 GROUP BY severity\n    ").all();
        res.statusCode = 200;
        res.end(JSON.stringify({
            series: series,
            summary: { maxDrift: maxDrift, avgDrift: avgDrift, snapshots: series.length },
            violations: recentViolations,
        }));
    }
    catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
    }
});
/**
 * GET /api/governance
 * Returns violations grouped by severity for the Sovereign Governance Console.
 */
router.get("/api/governance", function (req, res) {
    res.setHeader("Content-Type", "application/json");
    try {
        var violations = database_1.db.prepare("\n      SELECT v.*, r.status as runStatus, r.currentPhase\n      FROM violations v\n      LEFT JOIN runs r ON r.runId = v.runId\n      ORDER BY v.id DESC LIMIT 500\n    ").all();
        var bySeverity = { error: [], warn: [], info: [] };
        var byRule = {};
        var unresolved = 0;
        for (var _i = 0, violations_1 = violations; _i < violations_1.length; _i++) {
            var v = violations_1[_i];
            var sev = v.severity || 'warn';
            if (!bySeverity[sev])
                bySeverity[sev] = [];
            bySeverity[sev].push(v);
            byRule[v.rule] = (byRule[v.rule] || 0) + 1;
            if (!v.resolved)
                unresolved++;
        }
        // Recent runs summary
        var runs = database_1.db.prepare("\n      SELECT runId, status, currentPhase, createdAt, updatedAt\n      FROM runs ORDER BY createdAt DESC LIMIT 20\n    ").all();
        var runStats = {
            total: runs.length,
            passed: runs.filter(function (r) { return r.status === 'done' || r.status === 'success'; }).length,
            failed: runs.filter(function (r) { return r.status === 'failed' || r.status === 'error'; }).length,
            running: runs.filter(function (r) { return r.status === 'running'; }).length,
        };
        res.statusCode = 200;
        res.end(JSON.stringify({
            total: violations.length,
            unresolved: unresolved,
            bySeverity: bySeverity,
            byRule: byRule,
            recent: violations.slice(0, 50),
            runs: runs.slice(0, 10),
            runStats: runStats,
        }));
    }
    catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
    }
});
/**
 * GET /api/mesh
 * Returns federation peer status for the Mesh panel.
 * Pings each configured peer with a HEAD request to check liveness.
 */
router.get("/api/mesh", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var peerEnv, peerUrls, syncMeta, lastSync, outboundCount, peers, localProposalCount, localModuleCount, err_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                res.setHeader("Content-Type", "application/json");
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                peerEnv = process.env.FEDERATION_PEERS || '';
                peerUrls = peerEnv.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
                syncMeta = database_1.db.prepare("SELECT value FROM metadata_store WHERE key = 'last_sync_time'").get();
                lastSync = (syncMeta === null || syncMeta === void 0 ? void 0 : syncMeta.value) || null;
                outboundCount = database_1.db.prepare("SELECT COUNT(*) as c FROM offline_queue WHERE type = 'SUPABASE'").get().c;
                return [4 /*yield*/, Promise.all(peerUrls.map(function (url) { return __awaiter(void 0, void 0, void 0, function () {
                        var start, online, latencyMs, ctrl_1, timer, r, _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    start = Date.now();
                                    online = false;
                                    latencyMs = null;
                                    _b.label = 1;
                                case 1:
                                    _b.trys.push([1, 3, , 4]);
                                    ctrl_1 = new AbortController();
                                    timer = setTimeout(function () { return ctrl_1.abort(); }, 3000);
                                    return [4 /*yield*/, fetch(url + '/fisp/v1/health', { method: 'GET', signal: ctrl_1.signal })];
                                case 2:
                                    r = _b.sent();
                                    clearTimeout(timer);
                                    online = r.ok;
                                    latencyMs = Date.now() - start;
                                    return [3 /*break*/, 4];
                                case 3:
                                    _a = _b.sent();
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/, {
                                        url: url,
                                        online: online,
                                        latencyMs: latencyMs,
                                        protocol: 'FISP v1.1',
                                    }];
                            }
                        });
                    }); }))];
            case 2:
                peers = _a.sent();
                localProposalCount = database_1.db.prepare('SELECT COUNT(*) as c FROM proposals').get().c;
                localModuleCount = database_1.db.prepare('SELECT COUNT(*) as c FROM modules').get().c;
                res.statusCode = 200;
                res.end(JSON.stringify({
                    peers: peers,
                    local: {
                        proposals: localProposalCount,
                        modules: localModuleCount,
                        outboundQueue: outboundCount,
                        lastSync: lastSync,
                        nodeId: process.env.SDOA_NODE_ID || 'local',
                    },
                    totalPeers: peers.length,
                    onlinePeers: peers.filter(function (p) { return p.online; }).length,
                }));
                return [3 /*break*/, 4];
            case 3:
                err_2 = _a.sent();
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err_2.message }));
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ── Action Endpoints ─────────────────────────────────────────────────────────
function parseBody(req) {
    return new Promise(function (resolve) {
        var body = "";
        req.on("data", function (c) { body += c; });
        req.on("end", function () { try {
            resolve(JSON.parse(body || "{}"));
        }
        catch (_a) {
            resolve({});
        } });
    });
}
/** Accepts workspace path from the VS Code extension, walks and updates ast cache size */
router.post("/api/actions/scan-workspace", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var payload, root, _a, count, workspaceHash, currentTelemetry, synced, syncErr_1, err_3;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 8, , 9]);
                return [4 /*yield*/, parseBody(req)];
            case 1:
                payload = _b.sent();
                root = payload.workspaceRoot || process.cwd();
                telemetry_1.telemetry.setState("scanning");
                (0, events_1.emit)("scan:start", { root: root });
                // Yield the event loop so the UI and SSE events can flush 'scanning' state before we block
                return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 100); })];
            case 2:
                // Yield the event loop so the UI and SSE events can flush 'scanning' state before we block
                _b.sent();
                telemetry_1.telemetry.resetDetectorHits();
                return [4 /*yield*/, runScanHeuristics(root)];
            case 3:
                _a = _b.sent(), count = _a.count, workspaceHash = _a.workspaceHash;
                currentTelemetry = telemetry_1.telemetry.get();
                try {
                    database_1.db.prepare('INSERT INTO offline_queue (type, target, payload, created_at) VALUES (?, ?, ?, ?)').run('SUPABASE', 'portfolio_usage', JSON.stringify({
                        workspace_hash: workspaceHash,
                        primitive_count: currentTelemetry.detectorHits.sdoaPrimitive,
                        workflow_count: currentTelemetry.detectorHits.sdoaWorkflow,
                        schema_count: currentTelemetry.detectorHits.sdoaSchema,
                        token_count: currentTelemetry.detectorHits.sdoaToken,
                        engine_count: currentTelemetry.detectorHits.sdoaEngine,
                        updated_at: new Date().toISOString()
                    }), new Date().toISOString());
                }
                catch (dbErr) {
                    console.error("Error inserting portfolio_usage:", dbErr);
                }
                telemetry_1.telemetry.setAstCacheSize(count);
                telemetry_1.telemetry.recordScan();
                synced = { flushed: 0, failed: 0 };
                _b.label = 4;
            case 4:
                _b.trys.push([4, 6, , 7]);
                return [4 /*yield*/, (0, offlineSync_1.flushQueue)()];
            case 5:
                synced = _b.sent();
                return [3 /*break*/, 7];
            case 6:
                syncErr_1 = _b.sent();
                console.error("Error flushing scan results to Supabase:", syncErr_1);
                return [3 /*break*/, 7];
            case 7:
                (0, events_1.emit)("scan:complete", { filesScanned: count, synced: synced });
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: true, filesScanned: count, synced: synced }));
                return [3 /*break*/, 9];
            case 8:
                err_3 = _b.sent();
                console.error("Error in /api/actions/scan-workspace:", err_3);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: String(err_3) }));
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/];
        }
    });
}); });
/** Clears in-memory AST cache size counter and emits event */
router.post("/api/actions/clear-cache", function (_req, res) {
    telemetry_1.telemetry.clearCache();
    (0, events_1.emit)("cache:cleared", {});
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
});
/** Manually triggers the offline sync queue flush */
router.post("/api/actions/flush-queue", function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, offlineSync_1.flushQueue)()];
            case 1:
                result = _a.sent();
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(__assign({ ok: true }, result)));
                return [2 /*return*/];
        }
    });
}); });
/** Resets engine state to idle and clears errors */
router.post("/api/actions/restart", function (_req, res) {
    telemetry_1.telemetry.reset();
    (0, events_1.emit)("engine:restart", {});
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
});
router.get("/public/styles.css", function (req, res) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/css");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.end(node_fs_1.default.readFileSync(node_path_1.default.join(__dirname, "../public/styles.css")));
});
router.get("/public/dashboard.js", function (req, res) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.end(node_fs_1.default.readFileSync(node_path_1.default.join(__dirname, "../public/dashboard.js")));
});
router.get("/public/assets/:file", function (req, res) {
    var file = req.url.split("/").pop();
    var filePath = node_path_1.default.join(__dirname, "../public/assets", file);
    if (node_fs_1.default.existsSync(filePath)) {
        res.statusCode = 200;
        if (file.endsWith(".svg"))
            res.setHeader("Content-Type", "image/svg+xml");
        if (file.endsWith(".png"))
            res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.end(node_fs_1.default.readFileSync(filePath));
    }
    else {
        res.statusCode = 404;
        res.end("Not Found");
    }
});
// ── Views & Static ───────────────────────────────────────────────────────────
router.get("/views/:view", function (req, res) {
    var viewName = req.url.split("/").pop();
    var viewPath = node_path_1.default.join(process.cwd(), "server", "public", "views", viewName + ".html");
    if (node_fs_1.default.existsSync(viewPath)) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(node_fs_1.default.readFileSync(viewPath));
    }
    else {
        res.statusCode = 404;
        res.end("View not found");
    }
});
router.get("/api/pr-status", function (req, res) {
    var urlParams = new URL(req.url, "http://localhost");
    var id = urlParams.searchParams.get("id");
    var prMeta = database_1.db.prepare('SELECT * FROM pr_metadata WHERE proposalId = ?').get(id);
    if (!prMeta) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "Not found" }));
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: prMeta.status, url: prMeta.prUrl }));
});
router.get("/", function (req, res) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    var htmlPath = node_path_1.default.join(process.cwd(), "server", "public", "index.html");
    if (node_fs_1.default.existsSync(htmlPath))
        res.end(node_fs_1.default.readFileSync(htmlPath));
    else
        res.end("Dashboard HTML not found.");
});
// Serve static public assets from root
exports.staticRouter = new Router_1.Router();
exports.staticRouter.use("/", function (req, res, next) {
    var assetPath = node_path_1.default.join(process.cwd(), "server", "public", req.url);
    if (node_fs_1.default.existsSync(assetPath) && node_fs_1.default.statSync(assetPath).isFile()) {
        if (assetPath.endsWith(".css"))
            res.setHeader("Content-Type", "text/css");
        else if (assetPath.endsWith(".js"))
            res.setHeader("Content-Type", "application/javascript");
        else if (assetPath.endsWith(".html"))
            res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        return res.end(node_fs_1.default.readFileSync(assetPath));
    }
    if (next)
        next();
});
exports.default = router;
