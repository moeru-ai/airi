# Memory Service

Centralized memory service for AIRI with PostgreSQL + pgvector + Redis Queue

## Features

- **Message Ingestion**: Store chat messages with automatic queue processing
- **AI Response Storage**: Store AI completions with context
- **Memory Processing**: Background LLM processing with Redis queue
- **Vector Search**: PostgreSQL + pgvector for similarity search
- **Sequential Processing**: Maintains message order and context

## Architecture

### Redis Queue System
- **Immediate Ingestion**: Messages are stored in DB and added to Redis queue
- **Sequential Processing**: Background task processes messages in order every 30 seconds
- **Lock Management**: Redis-based locking prevents concurrent processing
- **Batch Processing**: Processes up to 10 messages per batch to prevent token limits
- **Error Handling**: Failed messages remain unprocessed for retry

### Database Schema
- `chat_messages`: Raw chat messages with processing status
- `chat_completions_history`: AI responses with prompts
- `memory_fragments`: Processed memory fragments
- `memory_tags`: Categorization tags
- `memory_tag_relations`: Many-to-many tag relationships

## Setup

### 1. Environment Variables
Create a `.env` file with:

```bash
# Database Configuration
POSTGRES_PORT=5434
POSTGRES_PASSWORD=airi_password

# API Keys (at least one is required)
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_AI_API_KEY=your_google_ai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Logging
LOG_LEVEL=info
```

### 2. Start Services
```bash
# Install dependencies
pnpm install

# Start all services (PostgreSQL, Redis, Memory Service)
docker compose up -d

# Or start just the memory service
docker compose up --build airi-memory-service -d
```

### 3. Verify Setup
```bash
# Check health
curl http://localhost:3001/api/health

# Check queue status
curl http://localhost:3001/api/queue/status
```

## API Endpoints

### Health & Status
- `GET /api/health` - Service health check
- `GET /api/queue/status` - Redis queue status

### Message Management
- `POST /api/messages` - Ingest new message
- `GET /api/messages/:id` - Get message by ID

### Completions
- `POST /api/completions` - Store AI response

## Message Processing Flow

1. **Ingestion**: Message stored in DB with `is_processed = false`
2. **Queue**: Message added to Redis queue for processing
3. **Background Processing**: Every 30 seconds, check for unprocessed messages
4. **Sequential Processing**: Process messages in order (max 10 per batch)
5. **LLM Processing**: Send batch to LLM for memory extraction
6. **Memory Storage**: Store fragments, tags, and relationships
7. **Mark Complete**: Update `is_processed = true`

## Monitoring

### Queue Status
```bash
curl http://localhost:3001/api/queue/status
```

Response:
```json
{
  "waiting": 5,
  "active": 1,
  "completed": 100,
  "failed": 0,
  "isProcessing": true
}
```

### Database Queries
```sql
-- Check unprocessed messages
SELECT COUNT(*) FROM chat_messages WHERE is_processed = false;

-- Check processing status
SELECT
  is_processed,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM chat_messages
GROUP BY is_processed;
```

## Development

### Local Development
```bash
# Install dependencies
pnpm install

# Start database and Redis
docker compose up airi-memory-pgvector airi-memory-redis -d

# Run in development mode
pnpm dev
```

### Testing
```bash
# Run tests
pnpm test

# Type checking
pnpm typecheck
```

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   - Ensure Redis container is running: `docker compose ps`
   - Check Redis logs: `docker compose logs airi-memory-redis`

2. **Database Connection Failed**
   - Ensure PostgreSQL container is running: `docker compose ps`
   - Check database logs: `docker compose logs airi-memory-pgvector`

3. **Queue Not Processing**
   - Check queue status: `GET /api/queue/status`
   - Verify Redis is accessible from memory service
   - Check memory service logs: `docker compose logs airi-memory-service`

### Logs
```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f airi-memory-service
docker compose logs -f airi-memory-redis
docker compose logs -f airi-memory-pgvector
```

## Performance

### Batch Processing
- **Batch Size**: 10 messages per batch (configurable)
- **Processing Interval**: 30 seconds (configurable)
- **Concurrency**: Single-threaded processing (maintains order)

### Scaling Considerations
- **Redis**: Can handle thousands of messages per second
- **Database**: PostgreSQL with proper indexing
- **LLM**: Rate limiting based on provider limits

## Security

- **API Key Required**: At least one LLM API key must be configured
- **CORS**: Configured for web applications
- **Input Validation**: All inputs validated with Valibot
- **Database**: Isolated PostgreSQL instance
- **Redis**: Internal network access only
