-- Seed per-KOL vocabulary for 股癌 (Gooaye / 謝孟恭).
-- These terms correct common Deepgram Nova-3 mis-transcriptions
-- of host names, contributor names, and show-specific jargon.

INSERT INTO kol_vocabulary (kol_id, pattern, replacement, is_regex, category, note) VALUES
  -- Host / contributors
  ('00000000-0000-0000-0000-000000000001', '謝 ?孟 ?恭', '謝孟恭', true, 'contributors', 'Host real name — Deepgram often inserts spaces'),
  ('00000000-0000-0000-0000-000000000001', '麗 ?莎', 'Lisa', true, 'contributors', 'Lisa — frequent co-host / guest reference'),
  ('00000000-0000-0000-0000-000000000001', '巧 ?克 ?力', 'Choco', true, 'contributors', 'Choco — frequent co-host / guest reference'),
  ('00000000-0000-0000-0000-000000000001', '莉 ?莎', 'Lisa', true, 'contributors', 'Alternate transcription of Lisa'),
  -- Show-specific terms
  ('00000000-0000-0000-0000-000000000001', '股癌 ?EP ?(\d+)', '股癌EP$1', true, 'show_terms', 'Normalize episode references'),
  ('00000000-0000-0000-0000-000000000001', '乾爹', '乾爹', false, 'show_terms', 'Show nickname for the host'),
  ('00000000-0000-0000-0000-000000000001', '聲浪', 'SoundOn', false, 'show_terms', 'Podcast platform — sometimes transcribed as Chinese'),
  ('00000000-0000-0000-0000-000000000001', 'Sound ?On', 'SoundOn', true, 'show_terms', 'Podcast platform — normalize spacing')
ON CONFLICT (kol_id, pattern) DO NOTHING;
