-- Remove existing bucket if it exists
DELETE FROM storage.buckets WHERE id = 'user_fonts';

-- Create the fonts storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user_fonts',
  'user_fonts',
  false,
  5242880, -- 5MB in bytes
  ARRAY[
    'font/ttf',
    'font/otf',
    'application/x-font-ttf',
    'application/x-font-otf',
    'application/octet-stream'
  ]
);

-- Enable RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload their own fonts" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own fonts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own fonts" ON storage.objects;

-- Policy to allow users to insert their own font files
CREATE POLICY "Users can upload their own fonts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user_fonts' AND
  STARTS_WITH(name, auth.uid()::text || '/')
);

-- Policy to allow users to read their own font files
CREATE POLICY "Users can read their own fonts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'user_fonts' AND
  STARTS_WITH(name, auth.uid()::text || '/')
);

-- Policy to allow users to delete their own font files
CREATE POLICY "Users can delete their own fonts"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'user_fonts' AND
  STARTS_WITH(name, auth.uid()::text || '/')
);

-- Create a function to get the folder name parts
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN string_to_array(regexp_replace(name, '^[^/]*/', ''), '/');
END
$$; 