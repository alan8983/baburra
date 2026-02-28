-- Defense-in-depth: prevent ai_usage_count from going negative.
-- The RPC function already enforces this, but the constraint guards against future bugs.
ALTER TABLE profiles
  ADD CONSTRAINT chk_ai_usage_count_non_negative
  CHECK (ai_usage_count >= 0);
