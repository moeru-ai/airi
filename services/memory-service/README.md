# Memory Service

Memory service for AIRI with PostgreSQL + pgvector.

## Features

- **Message Ingestion**: Store chat messages
- **AI Response Storage**: Store AI completions with full context preservation
- **Memory Processing**: LLM-powered memory extraction and consolidation
- **Vector Semantic Search**: Multi-dimensional embeddings with similarity search
- **Context Building**: Dynamic context generation for improved AI responses

## Architecture

### Background Processing System
- **Immediate Ingestion**: Messages stored in database instantly
- **Background Processing**: Smart batch processing every 30 seconds fo fill up database tables related to recent conversation/memories
- **Smart Batching**: Token-aware batching to optimize LLM processing

### Advanced Database Schema

> **Note**: Tables marked with 🚧 are defined in the schema but not yet (fully) implemented in the application logic. Either they are not being populate or not used for context building! The current implementation focuses on basic message ingestion, memory fragment creation, and vector-based context building.

- **Core Tables**:
  - ✅ `chat_messages`: Raw messages with multi-dimensional vector embeddings
  - ✅ `chat_completions_history`: AI responses with prompts and metadata
  - ✅ `memory_fragments`: Processed memory pieces with importance scoring
  - ✅ `memory_settings`: LLM and embedding provider configurations
  - 🚧 `memory_consolidated_memories`: Summarized and consolidated memories
  - ✅ `memory_episodes`: Temporal memory groupings
  - ✅ `memory_entities`: Named entities with relationships
  - ✅ `memory_long_term_goals`: User goals and progress tracking
  - ✅ `memory_short_term_ideas`: Temporary ideas and inspirations
- **Relationship Tables**:
  - 🚧 `memory_tags`: Tag definitions (created but not actively used)
  - 🚧 `memory_associations`: Memory-to-memory relationships
  - 🚧 `memory_entity_relations`: Entity-memory connections
  - 🚧 `memory_tag_relations`: Flexible tagging system
- **Analytics Tables**:
  - 🚧 `memory_access_patterns`: Usage analytics and optimization
  - 🚧 `memory_search_history`: Search behavior tracking
  - 🚧 `memory_consolidation_events`: Memory processing events

## Setup

### 1. Settings Variables

From the UI, in `Settings -> Memory` setup your LLM provider, Embedding provider, and API keys

### 2. Start Services
```bash
pnpm install

# Start DB
cd services/memory-service/
docker compose up airi-memory-pgvector -d

# Start services
## 1. Go to project root (if not already)
## 2. Start web UI
pnpm run dev

## 3. Start Memory backend service
pnpm run dev:memory

## 2 & 3. Alternative: run web UI and backend with one command
pnpm run dev:with-memory

# Setup DB (first time only) --> this applies migration
cd services/memory-service/
pnpm db:setup
```

## API Endpoints

### Health & Status
- `GET /api/health` - Backend service health check
- `GET /api/test-conn` - Test API authentication
- `GET /api/database-url` - Check database connection URL in use

### Message Management
- `POST /api/messages` - Ingest new message for processing
- `POST /api/completions` - Store AI completion response
- `POST /api/context` - Build context for a query message
- `GET /api/conversations` - Get paginated conversation history

### Settings & Configuration
- `POST /api/settings` - Update LLM and embedding provider settings (for backend use)
- `GET /api/settings/regeneration-status` - Check embedding regeneration progress (triggered when embedding configuration changes in Settings)

## Message Processing Flow

1. **Immediate Ingestion**: Message stored in database with `is_processed = false`
   1. **Vector Embedding**: Generate embeddings for semantic search (if provider configured)
2. **Background Processing**: Every 30 seconds, check for unprocessed messages
   1. **Smart Batching**: Group messages by content length and token estimation
   2. **LLM Analysis**: Send batches to configured LLM provider for memory extraction
   3. **Memory Creation**: Store extracted fragments, entities, goals, and ideas
   4. **Relationship Mapping**: Create associations between memories and entities
   <!-- 5. **Consolidation**: Merge related memories and update importance scores -->
   6. **Completion**: Mark messages as processed and update access patterns

# Performance

### Intelligent Processing
- **Smart Batching**: Dynamic batch sizes based on content length and token estimation
- **Processing Interval**: 30 seconds (configurable via background trigger)
- **Sequential Processing**: Maintains conversation order and context
- **Embedding Regeneration**: Parallel processing with configurable batch sizes

### Vector Search Optimization
- **Multi-dimensional Embeddings**: Support for 768, 1024, and 1536 dimensions
- **HNSW Indexing**: High-performance vector similarity search
- **Selective Embedding**: Only generate embeddings when providers are configured

# Advanced Features

## Memory Types
- **Memory Fragments**: Core memory pieces with importance and emotional impact scoring
- **Consolidated Memories**: Summarized memories from multiple fragments
- **Episodes**: Temporal groupings of related memories
- **Entities**: Named entities with relationship mapping
- **Goals**: Long-term goal tracking with progress monitoring
- **Ideas**: Short-term creative ideas and inspirations

## Context Building
- **Semantic Search**: Vector-based similarity matching
- **Relationship Traversal**: Follow entity and memory associations
- **Temporal Relevance**: Recent conversation context prioritization
- **Importance Weighting**: Dynamic context scoring based on memory importance

<!-- ## Analytics & Insights
- **Access Pattern Tracking**: Monitor memory usage and optimization opportunities
- **Search History**: Track query patterns and result effectiveness
- **Consolidation Events**: Memory processing and relationship formation events
- **Performance Metrics**: OpenTelemetry integration for observability -->
