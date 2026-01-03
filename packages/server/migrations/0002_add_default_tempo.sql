-- Add default_tempo column to pieces table
ALTER TABLE pieces ADD COLUMN default_tempo INTEGER DEFAULT 120;
