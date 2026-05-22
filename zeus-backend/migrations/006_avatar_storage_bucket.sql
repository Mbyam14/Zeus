-- Migration 006: Create storage bucket for user avatars
-- Run this in the Supabase SQL Editor

-- Create the avatars storage bucket (public so URLs work on frontend)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  524288,  -- 512KB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow the service role (backend) to manage avatars
-- No RLS policies needed since backend uses service_key which bypasses RLS
