import { Hono } from "hono";
import type { Env } from "../lib/supabase";
import { createSupabaseClient } from "../lib/supabase";

const proposals = new Hono<{ Bindings: Env }>();

/**
 * POST /api/proposals
 * Accept FISP proposal envelopes from VS Code extensions (local or remote).
 */
proposals.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.proposalId || !body.innovations) {
    return c.json(
      { ok: false, error: "Missing proposalId or innovations" },
      400
    );
  }

  const supabase = createSupabaseClient(c.env);

  const { error } = await supabase.from("proposals").upsert(
    {
      id: body.proposalId,
      status: "queued",
      origin: body.origin || "vsx-extension",
      workspace_hash: body.workspace_hash || null,
      data: body,
      created_at: body.timestamp || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    console.error("[Proposals] Insert error:", error);
    return c.json({ ok: false, error: error.message }, 500);
  }

  return c.json({ ok: true, id: body.proposalId, status: "queued" });
});

/**
 * GET /api/proposals
 * List recent proposals (paginated).
 */
proposals.get("/", async (c) => {
  const supabase = createSupabaseClient(c.env);
  const limit = parseInt(c.req.query("limit") || "25");
  const offset = parseInt(c.req.query("offset") || "0");

  const { data, error, count } = await supabase
    .from("proposals")
    .select("id, status, origin, workspace_hash, created_at, updated_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return c.json({ ok: false, error: error.message }, 500);
  }

  return c.json({ ok: true, data, total: count });
});

/**
 * GET /api/proposals/:id
 * Retrieve a single proposal with full data payload.
 */
proposals.get("/:id", async (c) => {
  const supabase = createSupabaseClient(c.env);
  const id = c.req.param("id");

  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return c.json({ ok: false, error: error.message }, 404);
  }

  return c.json({ ok: true, data });
});

export default proposals;
