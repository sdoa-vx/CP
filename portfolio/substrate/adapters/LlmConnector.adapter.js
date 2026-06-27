// ──────────────────────────────────────────────────────────────────
// File:    LlmConnector.adapter.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure (compiled JS)
// ──────────────────────────────────────────────────────────────────
"use strict";
// ============================================================
// LlmConnector.adapter.ts — SDOA v5.0 Adapter
// version: 5.0.0
// Last modified: 2026-06-02 01:30 UTC
// ============================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmConnectorAdapter = void 0;
const https = __importStar(require("https"));
class LlmConnectorAdapter {
    httpsPost(options, body) {
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
            });
            req.setTimeout(120000, () => { req.destroy(); reject(new Error("Request timeout after 120s")); });
            req.on("error", reject);
            if (body)
                req.write(body);
            req.end();
        });
    }
    async callAnthropic(apiKey, model, systemPrompt, message, onChunk) {
        const payload = {
            model,
            max_tokens: 4096,
            messages: [{ role: "user", content: message }],
            stream: !!onChunk,
        };
        if (systemPrompt)
            payload.system = systemPrompt;
        const body = JSON.stringify(payload);
        const headers = {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-length": Buffer.byteLength(body).toString(),
        };
        if (!onChunk) {
            const res = await this.httpsPost({
                hostname: "api.anthropic.com", port: 443,
                path: "/v1/messages", method: "POST", headers,
            }, body);
            if (res.statusCode !== 200) {
                throw new Error(`Anthropic ${res.statusCode}: ${res.body.slice(0, 300)}`);
            }
            return JSON.parse(res.body).content?.[0]?.text || "";
        }
        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: "api.anthropic.com", port: 443,
                path: "/v1/messages", method: "POST", headers,
            }, (res) => {
                if (res.statusCode !== 200) {
                    let errBody = "";
                    res.on("data", d => errBody += d.toString());
                    res.on("end", () => reject(new Error(`Anthropic ${res.statusCode}: ${errBody.slice(0, 300)}`)));
                    return;
                }
                let fullText = "";
                let buf = "";
                res.on("data", chunk => {
                    buf += chunk.toString();
                    const lines = buf.split("\n");
                    buf = lines.pop() || "";
                    for (const line of lines) {
                        if (!line.startsWith("data: "))
                            continue;
                        const raw = line.slice(6).trim();
                        if (raw === "[DONE]")
                            continue;
                        try {
                            const evt = JSON.parse(raw);
                            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                                const token = evt.delta.text || "";
                                if (token) {
                                    fullText += token;
                                    onChunk(token);
                                }
                            }
                        }
                        catch (_) { }
                    }
                });
                res.on("end", () => resolve(fullText));
            });
            req.setTimeout(120000, () => { req.destroy(); reject(new Error("Anthropic stream timeout")); });
            req.on("error", reject);
            req.write(body);
            req.end();
        });
    }
    async callOpenAICompat(hostname, apiKey, model, systemPrompt, message, onChunk) {
        const payload = {
            model,
            max_tokens: 4096,
            stream: !!onChunk,
            messages: [
                ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
                { role: "user", content: message },
            ],
        };
        const body = JSON.stringify(payload);
        const headers = {
            "content-type": "application/json",
            "authorization": `Bearer ${apiKey}`,
            "content-length": Buffer.byteLength(body).toString(),
        };
        if (hostname.includes("openrouter")) {
            headers["http-referer"] = "https://protoai.app";
            headers["x-title"] = "ProtoAI";
        }
        const apiPath = hostname.includes("openrouter") ? "/api/v1/chat/completions" : "/v1/chat/completions";
        if (!onChunk) {
            const res = await this.httpsPost({
                hostname, port: 443,
                path: apiPath, method: "POST", headers,
            }, body);
            if (res.statusCode !== 200) {
                if (res.statusCode === 400) {
                    try {
                        const errData = JSON.parse(res.body);
                        const errMsg = errData?.error?.message || "";
                        const m = errMsg.match(/passed (\d+) input tokens.*?context length is only (\d+)/i)
                            || errMsg.match(/maximum context length is (\d+).*?you requested \d+ tokens \((\d+) in the messages/i);
                        if (m) {
                            const inputTokens = parseInt(m[1], 10);
                            const contextLen = parseInt(m[2], 10);
                            const safeMax = Math.max(256, contextLen - inputTokens - 16);
                            console.log(`[LlmConnector] Context overflow retry: max_tokens=${safeMax}`);
                            const retryPayload = Object.assign({}, payload, { max_tokens: safeMax });
                            const retryBody = JSON.stringify(retryPayload);
                            const retryHeaders = Object.assign({}, headers, { "content-length": Buffer.byteLength(retryBody).toString() });
                            const res2 = await this.httpsPost({
                                hostname, port: 443,
                                path: apiPath, method: "POST", headers: retryHeaders,
                            }, retryBody);
                            if (res2.statusCode !== 200) {
                                throw new Error(`${hostname} ${res2.statusCode}: ${res2.body.slice(0, 300)}`);
                            }
                            return JSON.parse(res2.body).choices?.[0]?.message?.content || "";
                        }
                    }
                    catch (retryErr) {
                        if (retryErr.message && retryErr.message.startsWith(hostname))
                            throw retryErr;
                    }
                }
                throw new Error(`${hostname} ${res.statusCode}: ${res.body.slice(0, 300)}`);
            }
            return JSON.parse(res.body).choices?.[0]?.message?.content || "";
        }
        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname, port: 443,
                path: apiPath, method: "POST", headers,
            }, (res) => {
                if (res.statusCode !== 200) {
                    let errBody = "";
                    res.on("data", d => errBody += d.toString());
                    res.on("end", async () => {
                        if (res.statusCode === 400) {
                            try {
                                const errData = JSON.parse(errBody);
                                const errMsg = errData?.error?.message || "";
                                const m = errMsg.match(/passed (\d+) input tokens.*?context length is only (\d+)/i)
                                    || errMsg.match(/maximum context length is (\d+).*?you requested \d+ tokens \((\d+) in the messages/i);
                                if (m) {
                                    const inputTokens = parseInt(m[1], 10);
                                    const contextLen = parseInt(m[2], 10);
                                    const safeMax = Math.max(256, contextLen - inputTokens - 16);
                                    console.log(`[LlmConnector] Stream context overflow retry: max_tokens=${safeMax}`);
                                    const retryPayload = Object.assign({}, payload, { max_tokens: safeMax, stream: false });
                                    const retryBody = JSON.stringify(retryPayload);
                                    const retryHeaders = Object.assign({}, headers, { "content-length": Buffer.byteLength(retryBody).toString() });
                                    try {
                                        const res2 = await this.httpsPost({
                                            hostname, port: 443,
                                            path: apiPath, method: "POST", headers: retryHeaders,
                                        }, retryBody);
                                        if (res2.statusCode === 200) {
                                            const retryText = JSON.parse(res2.body).choices?.[0]?.message?.content || "";
                                            if (retryText && onChunk)
                                                onChunk(retryText);
                                            return resolve(retryText);
                                        }
                                    }
                                    catch (_) { }
                                }
                            }
                            catch (_) { }
                        }
                        reject(new Error(`${hostname} ${res.statusCode}: ${errBody.slice(0, 300)}`));
                    });
                    return;
                }
                let fullText = "";
                let buf = "";
                res.on("data", chunk => {
                    buf += chunk.toString();
                    const lines = buf.split("\n");
                    buf = lines.pop() || "";
                    for (const line of lines) {
                        if (!line.startsWith("data: "))
                            continue;
                        const raw = line.slice(6).trim();
                        if (raw === "[DONE]")
                            continue;
                        try {
                            const evt = JSON.parse(raw);
                            const token = evt.choices?.[0]?.delta?.content || "";
                            if (token) {
                                fullText += token;
                                onChunk(token);
                            }
                        }
                        catch (_) { }
                    }
                });
                res.on("end", () => resolve(fullText));
            });
            req.setTimeout(120000, () => { req.destroy(); reject(new Error(`${hostname} stream timeout`)); });
            req.on("error", reject);
            req.write(body);
            req.end();
        });
    }
}
exports.LlmConnectorAdapter = LlmConnectorAdapter;
LlmConnectorAdapter.MANIFEST = {
    id: "LlmConnector.adapter",
    type: "adapter",
    layer: 3,
    runtime: "NodeJS",
    version: "5.0.0",
    operationalRole: "savant",
    requires: [],
    optimization: {
        priority: "readability",
        assertionSuite: ""
    },
    docs: {
        description: "Handles low-level HTTPS queries and SSE streaming connections to LLM providers.",
        author: "ProtoAI team",
        sdoa: "5.0.0"
    }
};
