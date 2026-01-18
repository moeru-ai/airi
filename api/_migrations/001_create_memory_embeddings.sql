-- Migration: Create memory_embeddings table for long-term memory storage
-- This table stores vector embeddings for semantic search of user memories

-- Enable pgvector extension (required for vector similarity search)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create memory_embeddings table
CREATE TABLE IF NOT EXISTS memory_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768),  -- Adjust dimension based on your embedding model
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_memory_user_id (user_id),
    INDEX idx_memory_created_at (created_at DESC)
);

-- Create index for vector similarity search (HNSW for better performance)
CREATE INDEX IF NOT EXISTS idx_memory_embedding_hnsw 
ON memory_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- Alternative: IVFFlat index (faster build, slightly slower search)
-- CREATE INDEX IF NOT EXISTS idx_memory_embedding_ivfflat 
-- ON memory_embeddings 
-- USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Grant permissions (adjust based on your database user)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON memory_embeddings TO your_db_user;

COMMENT ON TABLE memory_embeddings IS 'Stores user memories as vector embeddings for semantic search';
COMMENT ON COLUMN memory_embeddings.embedding IS 'Vector embedding dimension should match your model (768 for bge-base-en-v1.5, 1536 for text-embedding-3-small, etc.)';
