-- Add rewrite_model column to user_settings table
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS rewrite_model text; 