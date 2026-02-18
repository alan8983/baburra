-- Add timezone column to profiles table
-- Default to Asia/Taipei for existing Taiwan-based users
ALTER TABLE profiles ADD COLUMN timezone TEXT DEFAULT 'Asia/Taipei';
