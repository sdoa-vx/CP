-- Supabase Proposal Memory Schema

CREATE TABLE IF NOT EXISTS proposals (
    id UUID PRIMARY KEY,
    cluster_id TEXT,
    pattern_id TEXT,
    module_suggestion TEXT,
    capability_surface JSONB,
    reasoning TEXT,
    state TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposal_governance_events (
    id UUID PRIMARY KEY,
    proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
    authority TEXT,
    event_type TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposal_lineage (
    id UUID PRIMARY KEY,
    proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
    module_id TEXT,
    parent_module_id TEXT,
    lineage_tree JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposal_extractions (
    id UUID PRIMARY KEY,
    proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
    extracted_module_path TEXT,
    manifest JSONB,
    runtime TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposal_mesh_effects (
    id UUID PRIMARY KEY,
    proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
    routing_surface_diff JSONB,
    drift_forecast_diff JSONB,
    transport_diff JSONB,
    applied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chronicle_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id TEXT,
    event_type TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
