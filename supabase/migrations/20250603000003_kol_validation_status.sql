-- Add validation lifecycle columns to kols table
ALTER TABLE kols
  ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validation_score JSONB,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES auth.users(id);

-- Set existing KOLs to 'active' (they were manually curated)
UPDATE kols SET validation_status = 'active' WHERE validation_status = 'pending';

-- Index for filtering by validation status
CREATE INDEX IF NOT EXISTS idx_kols_validation ON kols(validation_status);
