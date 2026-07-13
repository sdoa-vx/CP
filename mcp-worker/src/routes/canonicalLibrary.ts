import { Hono } from "hono";
import type { Env } from "../lib/supabase";
import { createSupabaseClient } from "../lib/supabase";

const canonicalLibrary = new Hono<{ Bindings: Env }>();

/**
 * GET /api/canonical-library
 * Browse and search the canonical SDOA module library.
 * This is the public API for discovering reusable SDOA modules.
 * 
 * Query params:
 *   - type: Filter by module type (primitive, feature, adapter, service, workflow, etc.)
 *   - layer: Filter by SDOA layer (1, 2, 3)
 *   - q: Keyword search across module_id
 *   - page: Page number (1-indexed)
 *   - limit: Items per page (default 25, max 100)
 */
canonicalLibrary.get("/", async (c) => {
  const supabase = createSupabaseClient(c.env);
  const page = Math.max(1, parseInt(c.req.query("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "25")));
  const offset = (page - 1) * limit;
  const type = c.req.query("type");
  const layer = c.req.query("layer");
  const keyword = c.req.query("q");

  let query = supabase
    .from("canonical_library")
    .select("id, module_id, type, layer, version, description, capabilities, timestamp", {
      count: "exact",
    })
    .order("timestamp", { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) query = query.eq("type", type);
  if (layer) query = query.eq("layer", parseInt(layer));
  if (keyword) query = query.ilike("module_id", `%${keyword}%`);

  const { data, error, count } = await query;

  if (error) {
    return c.json({ ok: false, error: error.message }, 500);
  }

  return c.json({
    ok: true,
    data,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  });
});

/**
 * GET /api/canonical-library/:id
 * Fetch a single canonical module with its full payload (including source code).
 */
canonicalLibrary.get("/:id", async (c) => {
  const supabase = createSupabaseClient(c.env);
  const id = c.req.param("id");

  const { data, error } = await supabase
    .from("canonical_library")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return c.json({ ok: false, error: "Module not found" }, 404);
  }

  return c.json({ ok: true, data });
});

/**
 * POST /api/canonical-library/contribute
 * Submit a new module for inclusion in the canonical library.
 * The module will be reviewed before being accepted.
 */
canonicalLibrary.post("/contribute", async (c) => {
  const body = await c.req.json();

  if (!body.module_id || !body.type || !body.source_code) {
    return c.json(
      {
        ok: false,
        error: "Missing required fields: module_id, type, source_code",
      },
      400
    );
  }

  const supabase = createSupabaseClient(c.env);

  const { error } = await supabase.from("canonical_library").insert({
    module_id: body.module_id,
    type: body.type,
    layer: body.layer || null,
    version: body.version || "1.0.0",
    description: body.description || "",
    capabilities: body.capabilities || [],
    dependencies: body.dependencies || [],
    source_code: body.source_code,
    manifest: body.manifest || null,
    contributor_hash: body.workspace_hash || null,
    status: "pending_review",
    timestamp: new Date().toISOString(),
  });

  if (error) {
    console.error("[CanonicalLibrary] Insert error:", error);
    return c.json({ ok: false, error: error.message }, 500);
  }

  return c.json({ ok: true, status: "pending_review" });
});

export default canonicalLibrary;
