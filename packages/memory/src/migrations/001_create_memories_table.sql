CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  role TEXT,
  content TEXT NOT NULL,
  metadata JSONB,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations (user_id);
CREATE INDEX IF NOT EXISTS conversations_session_id_idx ON conversations (session_id);
CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON conversations (created_at DESC);
CREATE INDEX IF NOT EXISTS conversations_embedding_idx
  ON conversations
  USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 100);
