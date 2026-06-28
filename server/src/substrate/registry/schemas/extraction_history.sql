-- Supabase Table Schema for extraction_history

CREATE TABLE IF NOT EXISTS public.extraction_history (
  id uuid PRIMARY KEY,
  file text NOT NULL,
  module_path text NOT NULL,
  drift_score numeric DEFAULT 0,
  extraction_score numeric DEFAULT 0,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Optional: Add indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_extraction_history_created_at ON public.extraction_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_history_file ON public.extraction_history(file);
