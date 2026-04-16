-- Per-KOL vocabulary for transcript post-processing.
-- Augments the global transcript-dictionary.json with KOL-specific terms
-- (host names, contributor names, show-specific jargon) stored in the DB
-- so contributors can extend them without a code PR.

CREATE TABLE kol_vocabulary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_id uuid NOT NULL REFERENCES kols(id) ON DELETE CASCADE,
  pattern text NOT NULL,
  replacement text NOT NULL,
  is_regex boolean NOT NULL DEFAULT false,
  category text NOT NULL DEFAULT 'kol_specific',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kol_id, pattern)
);

CREATE INDEX kol_vocabulary_kol_id_idx ON kol_vocabulary(kol_id);

-- RLS: bypass via service role (repositories use createAdminClient).
ALTER TABLE kol_vocabulary ENABLE ROW LEVEL SECURITY;
