CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversation_messages (
    id UUID PRIMARY KEY,
    message_order BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    conversation_id UUID NOT NULL
        REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL
        CHECK (role IN ('system', 'user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversation_messages_conversation_id
ON conversation_messages(conversation_id);