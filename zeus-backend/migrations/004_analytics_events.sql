-- Analytics events table for tracking user behavior
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_name VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    properties JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created ON analytics_events(event_name, created_at DESC);

-- RLS: users can only see their own events (admin can see all via service key)
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analytics" ON analytics_events
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can insert for any user (backend inserts on behalf of users)
CREATE POLICY "Service can insert analytics" ON analytics_events
    FOR INSERT WITH CHECK (true);
