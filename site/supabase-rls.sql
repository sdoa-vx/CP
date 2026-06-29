-- ============================================================================
-- TrackSDOA — Row-Level Security for public (anon) read access
-- Run in the Supabase SQL editor.
--
-- How this stays safe: the SERVER writes with the service key, which BYPASSES
-- RLS, so offlineSync upserts keep working untouched. The WEBSITE uses the
-- public anon key, which these policies restrict to READ-ONLY. With RLS enabled
-- and only SELECT policies for anon, the anon key cannot insert/update/delete.
-- ============================================================================

-- 1) Enable RLS (this DENIES all access until a policy explicitly allows it)
alter table sdoa_portfolio    enable row level security;
alter table portfolio_usage   enable row level security;
alter table innovation_events enable row level security;

-- 2) Allow the anonymous (public) role to READ only — no write policies exist,
--    so anon is read-only by construction.
drop policy if exists "anon read" on sdoa_portfolio;
create policy "anon read" on sdoa_portfolio    for select to anon using (true);

drop policy if exists "anon read" on portfolio_usage;
create policy "anon read" on portfolio_usage   for select to anon using (true);

drop policy if exists "anon read" on innovation_events;
create policy "anon read" on innovation_events for select to anon using (true);


-- ============================================================================
-- OPTIONAL (recommended): keep raw source_code out of the public site.
-- sdoa_portfolio stores each module's FULL source_code. The tracker only needs
-- module_id / type / version / file_path / workspace_hash. Expose a trimmed
-- view and point the site at it instead of the raw table.
--
-- To use this: run the block below, DROP the "anon read" policy on
-- sdoa_portfolio (so the raw table with source_code isn't anon-readable), and
-- set PORTFOLIO_TABLE = "portfolio_public" in site/index.html CONFIG.
-- ============================================================================
-- create or replace view portfolio_public as
--   select module_id, type, version, file_path, workspace_hash, timestamp
--   from sdoa_portfolio;
-- grant select on portfolio_public to anon;
-- drop policy if exists "anon read" on sdoa_portfolio;   -- lock the raw table
