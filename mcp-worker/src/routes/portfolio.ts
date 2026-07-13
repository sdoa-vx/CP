import { Hono } from "hono";
import type { Env } from "../lib/supabase";
import { createSupabaseClient } from "../lib/supabase";

const portfolio = new Hono<{ Bindings: Env }>();

/**
 * GET /api/portfolio
 * Query the sdoa_portfolio table for canonical SDOA modules.
 * Supports filtering by type, layer, and keyword search.
 */
portfolio.get("/", async (c) => {
  const supabase = createSupabaseClient(c.env);
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");
  const type = c.req.query("type");
  const layer = c.req.query("layer");
  const keyword = c.req.query("q");

  let query = supabase
    .from("sdoa_portfolio")
    .select(
      "id, module_id, type, file_path, version, workspace_hash, timestamp",
      { count: "exact" }
    )
    .order("timestamp", { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) query = query.eq("type", type);
  if (layer) query = query.eq("layer", parseInt(layer));
  if (keyword) query = query.ilike("module_id", `%${keyword}%`);

  const { data, error, count } = await query;

  if (error) {
    return c.json({ ok: false, error: error.message }, 500);
  }

  return c.json({ ok: true, data, total: count });
});

/**
 * GET /api/portfolio/stats
 * Aggregate usage statistics for the portfolio.
 */
portfolio.get("/stats", async (c) => {
  const supabase = createSupabaseClient(c.env);

  const { data, error } = await supabase
    .from("portfolio_usage")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(25);

  if (error) {
    return c.json({ ok: false, error: error.message }, 500);
  }

  return c.json({ ok: true, data });
});

export default portfolio;
