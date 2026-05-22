-- Password reset codes
-- Stores hashed one-time codes sent to users via email for password reset.
-- Codes are 6 digits, expire 15 minutes after creation, and are single-use.

CREATE TABLE IF NOT EXISTS password_reset_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    code_hash VARCHAR NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lookups are always (user_id WHERE used_at IS NULL AND expires_at > NOW())
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_active
    ON password_reset_codes(user_id, used_at, expires_at);

ALTER TABLE password_reset_codes ENABLE ROW LEVEL SECURITY;

-- Service role only; users never read these directly
CREATE POLICY "Service can manage reset codes" ON password_reset_codes
    FOR ALL WITH CHECK (true);
