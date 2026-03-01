-- Create a system user to own default/scraped recipes
-- This user cannot log in (password_hash is not a valid bcrypt hash)
INSERT INTO users (id, email, username, password_hash, profile_data)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'system@zeus.app',
    'Zeus Recipes',
    'SYSTEM_USER_NO_LOGIN',
    '{"is_system": true}'::jsonb
)
ON CONFLICT (email) DO NOTHING;
