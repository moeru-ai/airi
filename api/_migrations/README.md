# Database Migrations

## Setup Instructions

### 1. Connect to your Postgres database

```bash
psql $POSTGRES_URL
```

Or use your database provider's console (Neon, Supabase, Vercel Postgres, etc.)

### 2. Run the migration

```sql
\i 001_create_memory_embeddings.sql
```

Or copy-paste the SQL content from the file.

### 3. Verify the table was created

```sql
\d memory_embeddings
```

You should see the table structure with the `embedding` column of type `vector`.

## Important Notes

### Embedding Dimension

The `embedding vector(768)` dimension must match your embedding model:

- **Cloudflare `@cf/baai/bge-base-en-v1.5`**: 768 dimensions
- **OpenAI `text-embedding-3-small`**: 1536 dimensions
- **OpenAI `text-embedding-3-large`**: 3072 dimensions
- **OpenAI `text-embedding-ada-002`**: 1536 dimensions

To change the dimension, alter the table:

```sql
-- Example: Change to 1536 for OpenAI embeddings
ALTER TABLE memory_embeddings
ALTER COLUMN embedding TYPE vector(1536);

-- Recreate the index
DROP INDEX IF EXISTS idx_memory_embedding_hnsw;
CREATE INDEX idx_memory_embedding_hnsw
ON memory_embeddings
USING hnsw (embedding vector_cosine_ops);
```

### Environment Variables

Ensure these are set in your Vercel project:

```env
# Database connection
POSTGRES_URL=postgresql://user:pass@host:5432/dbname

# Long-term memory settings
LONG_TERM_MEMORY_ENABLED=true
LONG_TERM_MEMORY_PROVIDER=postgres-pgvector

# Embedding provider (choose one)
MEMORY_EMBEDDING_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
MEMORY_EMBEDDING_MODEL=@cf/baai/bge-base-en-v1.5

# Or use OpenAI
# MEMORY_EMBEDDING_PROVIDER=openai
# MEMORY_EMBEDDING_API_KEY=sk-...
# MEMORY_EMBEDDING_MODEL=text-embedding-3-small
```

## Manual Table Creation (Alternative)

If you prefer to create the table manually without pgvector extension:

```sql
CREATE TABLE memory_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding TEXT,  -- Store as JSON array string
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memory_user_id ON memory_embeddings(user_id);
CREATE INDEX idx_memory_created_at ON memory_embeddings(created_at DESC);
```

Note: This won't support efficient vector similarity search.
