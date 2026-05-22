-- Zeus AI Chat: conversations, messages, and user memory

-- One conversation thread per user
CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    summary TEXT DEFAULT '',
    summary_through_message_id UUID,
    message_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages
CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv_created
    ON ai_messages(conversation_id, created_at);

-- AI learned memory per user (max ~50 facts stored in JSONB array)
CREATE TABLE IF NOT EXISTS ai_user_memory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    facts JSONB DEFAULT '[]',
    last_extracted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_user_memory ENABLE ROW LEVEL SECURITY;

-- Users can only access their own conversation
CREATE POLICY "Users can view own conversation" ON ai_conversations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service can manage conversations" ON ai_conversations
    FOR ALL WITH CHECK (true);

-- Users can only see messages in their conversation
CREATE POLICY "Users can view own messages" ON ai_messages
    FOR SELECT USING (
        conversation_id IN (
            SELECT id FROM ai_conversations WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Service can manage messages" ON ai_messages
    FOR ALL WITH CHECK (true);

-- Users can only see their own memory
CREATE POLICY "Users can view own memory" ON ai_user_memory
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service can manage memory" ON ai_user_memory
    FOR ALL WITH CHECK (true);
