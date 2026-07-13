import { Hono } from "hono";
import type { Env } from "../lib/supabase";
import { createSupabaseClient } from "../lib/supabase";

const telemetry = new Hono<{ Bindings: Env }>();

/**
 * POST /api/telemetry
 * Accept telemetry events from remote VS Code extensions.
 * This allows anonymous usage tracking to improve the SDOA engine.
 */
telemetry.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.event_type) {
    return c.json({ ok: false, error: "Missing event_type" }, 400);
  }

  const supabase = createSupabaseClient(c.env);

  const { error } = await supabase.from("telemetry_events").insert({
    event_type: body.event_type,
    workspace_hash: body.workspace_hash || null,
    payload: body.payload || {},
    extension_version: body.extension_version || null,
    timestamp: new Date().toISOString(),
  });

  if (error) {
    console.error("[Telemetry] Insert error:", error);
    return c.json({ ok: false, error: error.message }, 500);
  }

  return c.json({ ok: true });
});

/**
 * GET /api/telemetry/summary
 * Return aggregate telemetry counts for the SDOA dashboard.
 */
telemetry.get("/summary", async (c) => {
  const supabase = createSupabaseClient(c.env);

  // Count distinct workspaces (anonymous installs)
  const { count: installCount } = await supabase
    .from("telemetry_events")
    .select("workspace_hash", { count: "exact", head: true });

  // Count total events
  const { count: eventCount } = await supabase
    .from("telemetry_events")
    .select("id", { count: "exact", head: true });

  // Count proposals
  const { count: proposalCount } = await supabase
    .from("proposals")
    .select("id", { count: "exact", head: true });

  return c.json({
    ok: true,
    data: {
      total_installs: installCount || 0,
      total_events: eventCount || 0,
      total_proposals: proposalCount || 0,
    },
  });
});

export default telemetry;
