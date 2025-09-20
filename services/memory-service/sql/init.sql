-- Enable pgvector compatibility mode
ALTER SYSTEM SET vectors.pgvector_compatibility=on;

-- Create the vectors extension
CREATE EXTENSION IF NOT EXISTS vectors; 