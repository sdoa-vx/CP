// Last modified: 2026-06-09 08:33 UTC
// response.ts — SDOAv5.0 Response Formatter

export class ResponseFormatter {
  static MANIFEST = {
    id: "ResponseFormatter.service",
    type: "service",
    layer: 3,
    runtime: "NodeJS",
    version: "5.0.0",
    requires: [],
    lifecycle: [],
    docs: {
      description: "Standardized response formatter for SDOA v5.",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };

  static ok(data: any): { ok: boolean; data: any } {
    return { ok: true, data };
  }

  ok(data: any): { ok: boolean; data: any } {
    return ResponseFormatter.ok(data);
  }

  static fail(error: string, detail: any = null): { ok: boolean; error: string; detail: any } {
    return { ok: false, error, detail };
  }

  fail(error: string, detail: any = null): { ok: boolean; error: string; detail: any } {
    return ResponseFormatter.fail(error, detail);
  }

  static safeJsonParse(str: string): { ok: boolean; value?: any; error?: any } {
    try {
      return { ok: true, value: JSON.parse(str) };
    } catch (err) {
      return { ok: false, error: err };
    }
  }

  safeJsonParse(str: string): { ok: boolean; value?: any; error?: any } {
    return ResponseFormatter.safeJsonParse(str);
  }

  static writeResponse(obj: any): void {
    if (obj === null || obj === undefined) return;
    try {
      if (typeof process !== "undefined" && process.stdout) {
        process.stdout.write(JSON.stringify(obj) + "\n");
      }
    } catch (err: any) {
      if (typeof process !== "undefined" && process.stderr) {
        process.stderr.write("[ResponseFormatter] ❌ Failed to serialize IPC response: " + err.message + "\n");
      }
    }
  }

  writeResponse(obj: any): void {
    ResponseFormatter.writeResponse(obj);
  }

  static writeError(id: string, error: string, detail: any = null): void {
    this.writeResponse({ id, ok: false, error, detail });
  }

  writeError(id: string, error: string, detail: any = null): void {
    ResponseFormatter.writeError(id, error, detail);
  }

  static writeSuccess(id: string, data: any): void {
    this.writeResponse({ id, ok: true, data });
  }

  writeSuccess(id: string, data: any): void {
    ResponseFormatter.writeSuccess(id, data);
  }

  static writeEvent(id: string, eventName: string, data: any): void {
    this.writeResponse({ id, ok: true, type: "event", event_name: eventName, data });
  }

  writeEvent(id: string, eventName: string, data: any): void {
    ResponseFormatter.writeEvent(id, eventName, data);
  }
}
