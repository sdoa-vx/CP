-- SDOA Cloud Ingress Schema Migration
-- Applied to Supabase to mirror local SQLite schemas and harden accessibility

-- 1. GitHub Installations Table
CREATE TABLE IF NOT EXISTS github_installations (
  installation_id BIGINT PRIMARY KEY,
  account_name TEXT NOT NULL,
  repositories JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 2. Proposals Table
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  origin TEXT NOT NULL,
  workspace_hash TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 3. PR Metadata Table (Correlates PRs to Proposals)
CREATE TABLE IF NOT EXISTS pr_metadata (
  proposal_id TEXT PRIMARY KEY REFERENCES proposals(id) ON DELETE CASCADE,
  pr_url TEXT,
  status TEXT,
  ci_status TEXT,
  ci_log_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 4. Canonical SDOA Module Library Table
CREATE TABLE IF NOT EXISTS canonical_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  layer INTEGER,
  version TEXT DEFAULT '1.0.0',
  description TEXT,
  capabilities TEXT[] DEFAULT '{}',
  dependencies TEXT[] DEFAULT '{}',
  source_code TEXT NOT NULL,
  manifest JSONB,
  contributor_hash TEXT,
  status TEXT DEFAULT 'pending_review',
  timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 5. Anonymous Telemetry Events Table
CREATE TABLE IF NOT EXISTS telemetry_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  workspace_hash TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  extension_version TEXT,
  timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 6. Ensure Core SDOA Telemetry tables exist (with correct schema types)
CREATE TABLE IF NOT EXISTS sdoa_portfolio (
  id BIGSERIAL PRIMARY KEY,
  module_id TEXT NOT NULL,
  type TEXT,
  file_path TEXT,
  source_code TEXT,
  workspace_hash TEXT NOT NULL,
  file_hash TEXT,
  version TEXT,
  timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  CONSTRAINT sdoa_portfolio_module_id_workspace_hash_key UNIQUE (module_id, workspace_hash)
);

CREATE TABLE IF NOT EXISTS portfolio_usage (
  id BIGSERIAL PRIMARY KEY,
  workspace_hash TEXT NOT NULL,
  primitive_count INTEGER DEFAULT 0,
  workflow_count INTEGER DEFAULT 0,
  schema_count INTEGER DEFAULT 0,
  token_count INTEGER DEFAULT 0,
  engine_count INTEGER DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS innovation_events (
  id BIGSERIAL PRIMARY KEY,
  workspace_hash TEXT NOT NULL,
  detector TEXT,
  file_path TEXT,
  matches INTEGER DEFAULT 0,
  ast_signature TEXT,
  timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- ─── ROW LEVEL SECURITY (RLS) POLICIES ──────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE github_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdoa_portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation_events ENABLE ROW LEVEL SECURITY;

-- 1. github_installations policies
CREATE POLICY "Allow service role full access on github_installations" 
  ON github_installations TO service_role USING (true) WITH CHECK (true);

-- 2. proposals policies
CREATE POLICY "Allow service role full access on proposals" 
  ON proposals TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous submission of proposals" 
  ON proposals FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anonymous read of own proposals" 
  ON proposals FOR SELECT TO anon USING (true);

-- 3. pr_metadata policies
CREATE POLICY "Allow service role full access on pr_metadata" 
  ON pr_metadata TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous read of pr_metadata" 
  ON pr_metadata FOR SELECT TO anon USING (true);

-- 4. canonical_library policies
CREATE POLICY "Allow service role full access on canonical_library" 
  ON canonical_library TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous read of approved canonical modules" 
  ON canonical_library FOR SELECT TO anon USING (status = 'approved');
CREATE POLICY "Allow anonymous contribution submission" 
  ON canonical_library FOR INSERT TO anon WITH CHECK (status = 'pending_review');

-- 5. telemetry_events policies
CREATE POLICY "Allow service role full access on telemetry_events" 
  ON telemetry_events TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous telemetry submission" 
  ON telemetry_events FOR INSERT TO anon WITH CHECK (true);

-- 6. sdoa_portfolio policies
CREATE POLICY "Allow service role full access on sdoa_portfolio" 
  ON sdoa_portfolio TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous insertion to sdoa_portfolio" 
  ON sdoa_portfolio FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anonymous read of sdoa_portfolio" 
  ON sdoa_portfolio FOR SELECT TO anon USING (true);

-- 7. portfolio_usage policies
CREATE POLICY "Allow service role full access on portfolio_usage" 
  ON portfolio_usage TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous insertion to portfolio_usage" 
  ON portfolio_usage FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anonymous read of portfolio_usage" 
  ON portfolio_usage FOR SELECT TO anon USING (true);

-- 8. innovation_events policies
CREATE POLICY "Allow service role full access on innovation_events" 
  ON innovation_events TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous insertion to innovation_events" 
  ON innovation_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anonymous read of innovation_events" 
  ON innovation_events FOR SELECT TO anon USING (true);

-- Indexes for performance queries
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_pr_metadata_status ON pr_metadata(status);
CREATE INDEX IF NOT EXISTS idx_canonical_library_type ON canonical_library(type);
CREATE INDEX IF NOT EXISTS idx_canonical_library_layer ON canonical_library(layer);
CREATE INDEX IF NOT EXISTS idx_sdoa_portfolio_workspace ON sdoa_portfolio(workspace_hash);
CREATE INDEX IF NOT EXISTS idx_portfolio_usage_workspace ON portfolio_usage(workspace_hash);
CREATE INDEX IF NOT EXISTS idx_innovation_events_workspace ON innovation_events(workspace_hash);

-- 7. PR Jobs & Events Tables for Automation Loop
CREATE TABLE IF NOT EXISTS sdoa_pr_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  branch TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  pr_url TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  submitted_at TIMESTAMPTZ
);

ALTER TABLE sdoa_pr_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role full access on sdoa_pr_jobs" 
  ON sdoa_pr_jobs TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous full access on sdoa_pr_jobs" 
  ON sdoa_pr_jobs TO anon USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS sdoa_pr_events (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID REFERENCES sdoa_pr_jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE sdoa_pr_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role full access on sdoa_pr_events" 
  ON sdoa_pr_events TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous read of sdoa_pr_events" 
  ON sdoa_pr_events FOR SELECT TO anon USING (true);

CREATE INDEX IF NOT EXISTS idx_sdoa_pr_jobs_status ON sdoa_pr_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sdoa_pr_events_job ON sdoa_pr_events(job_id);

-- 8. Compliance Scores Table
CREATE TABLE IF NOT EXISTS sdoa_compliance_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id TEXT UNIQUE NOT NULL,
  score INTEGER NOT NULL,
  checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  messages TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE sdoa_compliance_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role full access on sdoa_compliance_scores" 
  ON sdoa_compliance_scores TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous read of sdoa_compliance_scores" 
  ON sdoa_compliance_scores FOR SELECT TO anon USING (true);

-- 9. Lineage Ancestry Table
CREATE TABLE IF NOT EXISTS sdoa_lineage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  relation_type TEXT NOT NULL, -- 'refinement' | 'variant' | 'clone'
  timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE sdoa_lineage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role full access on sdoa_lineage" 
  ON sdoa_lineage TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous read of sdoa_lineage" 
  ON sdoa_lineage FOR SELECT TO anon USING (true);

-- 10. Multi-Agent Refinement Results Table
CREATE TABLE IF NOT EXISTS sdoa_multi_refinement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT UNIQUE NOT NULL,
  claude_output JSONB,
  gemini_output JSONB,
  merged_output JSONB,
  confidence INTEGER,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE sdoa_multi_refinement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role full access on sdoa_multi_refinement" 
  ON sdoa_multi_refinement TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous read of sdoa_multi_refinement" 
  ON sdoa_multi_refinement FOR SELECT TO anon USING (true);

CREATE INDEX IF NOT EXISTS idx_sdoa_compliance_scores_id ON sdoa_compliance_scores(canonical_id);
CREATE INDEX IF NOT EXISTS idx_sdoa_lineage_parent ON sdoa_lineage(parent_id);
CREATE INDEX IF NOT EXISTS idx_sdoa_multi_refinement_cand ON sdoa_multi_refinement(candidate_id);
