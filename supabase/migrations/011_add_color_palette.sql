-- Add color palette preference to profiles table
-- 'asian' = red=up, green=down (default for Asian markets)
-- 'american' = green=up, red=down
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS color_palette TEXT DEFAULT 'asian';
