// ──────────────────────────────────────────────────────────────────
// File:    LlmConnector.adapter.ts
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// LlmConnector.adapter.ts — SDOA v5.0 Adapter
// version: 5.0.0
// Last modified: 2026-06-02 01:30 UTC
// ============================================================

import { SdoaManifest } from '../services/Registry.service';
import * as https from 'https';

export class LlmConnectorAdapter {
  static MANIFEST: SdoaManifest = {
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

  httpsPost(options: https.RequestOptions, body: string): Promise<{ statusCode?: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
      });
      req.setTimeout(120000, () => { req.destroy(); reject(new Error("Request timeout after 120s")); });
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  }

  async callAnthropic(apiKey: string, model: string, systemPrompt: string, message: string, onChunk: ((chunk: string) => void) | null): Promise<string> {
    const payload: Record<string, any> = {
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: message }],
      stream: !!onChunk,
    };
    if (systemPrompt) payload.system = systemPrompt;

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
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") continue;
            try {
              const evt = JSON.parse(raw);
              if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                const token = evt.delta.text || "";
                if (token) { fullText += token; onChunk(token); }
              }
            } catch (_) {}
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

  async callOpenAICompat(hostname: string, apiKey: string, model: string, systemPrompt: string, message: string, onChunk: ((chunk: string) => void) | null): Promise<string> {
    const payload: Record<string, any> = {
      model,
      max_tokens: 4096,
      stream: !!onChunk,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: message },
      ],
    };

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
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
          } catch (retryErr: any) {
            if (retryErr.message && retryErr.message.startsWith(hostname)) throw retryErr;
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
                      if (retryText && onChunk) onChunk(retryText);
                      return resolve(retryText);
                    }
                  } catch (_) {}
                }
              } catch (_) {}
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
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") continue;
            try {
              const evt = JSON.parse(raw);
              const token = evt.choices?.[0]?.delta?.content || "";
              if (token) { fullText += token; onChunk(token); }
            } catch (_) {}
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
