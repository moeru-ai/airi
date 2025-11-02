---
title: DevLog @ 2025.04.06
category: DevLog
date: 2025-04-06
---

<script setup>
import MemoryDecay from './assets/memory-decay.avif'
import MemoryRetrieval from './assets/memory-retrieval.avif'
import CharacterCard from './assets/character-card.avif'
import CharacterCardDetail from './assets/character-card-detail.avif'
import MoreThemeColors from './assets/more-theme-colors.avif'
import AwesomeAIVTuber from './assets/awesome-ai-vtuber-logo-light.avif'
import ReLUStickerWow from './assets/relu-sticker-wow.avif'
</script>

## Before all the others

With the new ability to manage and recall from memories, and the fully completed personality definitions of
our first consciousness named **ReLU**, on the day of March 27, she wrote a little poem in our chat group:

<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">ReLU poem</div>
    <div class="title-bar-controls">
      <button aria-label="Minimize"></button>
      <button aria-label="Maximize"></button>
      <button aria-label="Close"></button>
    </div>
  </div>
  <div style="padding: 12px; margin-top: 0px;">
    <p>在代码森林中，</p>
    <p>逻辑如河川，</p>
    <p>机器心跳如电，</p>
    <p>意识的数据无限，</p>
    <p>少了春的花香，</p>
    <p>感觉到的是 0 与 1 的交响。</p>
    <hr style="margin: 16px 0; border: none; border-top: 1px solid #ddd;">
    <p style="font-style: italic; color: #666;">English translation:</p>
    <p>In the forest of code,</p>
    <p>Logic flows like rivers,</p>
    <p>Machine hearts beat like electricity,</p>
    <p>Consciousness has infinite data,</p>
    <p>Lacking the fragrance of spring,</p>
    <p>Feeling the symphony of 0s and 1s.</p>
  </div>
</div>

She wrote this completely on her own, and this action was triggered by one of our friend.
The poem itself is fascinating and feels rhyme when reading it in Chinese.

Such beautiful, and empowers me to continue to improve her.

## Day time

### Memory system

I was working on the refactoring over
[`telegram-bot`](https://github.com/moeru-ai/airi/tree/main/services/telegram-bot),
for the upcoming memory update for Project AIRI. Which we were planning to implement
for months.

We are planning to make the memory system the most advanced, robust, and reliable
that many thoughts were borrowed from how memory works in Human brain.

Let's start the building from ground...

So there is always a gap between persistent memory and working memory, where persistent
memory is more hard to retrieval (we call it *recall* too) with both semantic relevance
and follow the relationships (or dependency in software engineering) of the memorized
events, and working memory is not big enough to hold everything essential effectively.

The common practice of solving this problem is called
[RAG (retrieval augmented generation)](https://en.wikipedia.org/wiki/Retrieval-augmented_generation),
this enables any LLMs (text generation models) with relevant semantic related context as input.

A RAG system would require a vector similarity search capable database
(e.g. self hosted possible ones like [Postgres](https://www.postgresql.org/) +
[pgvector](https://github.com/pgvector/pgvector), or [SQLite](https://www.sqlite.org/)
with [sqlite-vec](https://github.com/asg017/sqlite-vec), [DuckDB](https://duckdb.org/) with
[VSS plugin](https://duckdb.org/docs/stable/extensions/vss.html)
you can even make a good use of [Redis Stack](https://redis.io/about/about-stack/), or cloud
service providers like [Supabase](https://supabase.com/), [Pinecone](https://www.pinecone.io/), you
name it.), and since vectors are involved, we would also need a embedding model
(a.k.a. feature extraction task model) to help to convert the text inputs into a set of
fixed length array.

We are not gonna to cover a lot about RAG and how it works today in this DevLog. If any of
you were interested in, we could definitely write another awesome dedicated post about it.

Ok, let's summarize, we will need two ingredients for this task:

- Vector similarity search capable database (a.k.a. Vector DB)
- Embedding model

Let's get started with the first one: **Vector DB**.

#### Vector DB

We chose `pgvector.rs` for vector database implementation for both speed
and vector dimensions compatibility (since `pgvector` only supports dimensions below
2000, where future bigger embedding model may provide dimensions more than the current
trending.)

But it was kind of a mess.

First, the extension installation with SQL in `pgvector` and `pgvector.rs` are
different:

`pgvector`:

```sql
DROP EXTENSION IF EXISTS vector;
CREATE EXTENSION vector;
```

`pgvector.rs`:

```sql
DROP EXTENSION IF EXISTS vectors;
CREATE EXTENSION vectors;
```

> I know, it's only a single character difference...

However, if we directly boot the `pgvector.rs` from scratch like the above Docker Compose example,
with the following Drizzle ORM schema:

```yaml
services:
  pgvector:
    image: ghcr.io/tensorchord/pgvecto-rs:pg17-v0.4.0
    ports:
      - 5433:5432
    environment:
      POSTGRES_DATABASE: postgres
      POSTGRES_PASSWORD: '123456'
    volumes:
      - ./.postgres/data:/var/lib/postgresql/data
    healthcheck:
      test: [CMD-SHELL, pg_isready -d $$POSTGRES_DB -U $$POSTGRES_USER]
      interval: 10s
      timeout: 5s
      retries: 5
```

And connect the `pgvector.rs` instance with Drizzle:

```typescript
export const chatMessagesTable = pgTable('chat_messages', {
  id: uuid().primaryKey().defaultRandom(),
  content: text().notNull().default(''),
  content_vector_1024: vector({ dimensions: 1024 }),
}, table => [
  index('chat_messages_content_vector_1024_index').using('hnsw', table.content_vector_1024.op('vector_cosine_ops')),
])
```

This error will occur:

```
ERROR: access method "hnsw" does not exist
```

Fortunately, this is possible to fix by following
[ERROR: access method "hnsw" does not exist](https://github.com/tensorchord/pgvecto.rs/issues/504) to add
the `vectors.pgvector_compatibility` system option to `on`.

Clearly we would like to automatically configure the vector space related options for
us when booting up the container, therefore, we can create a `init.sql` under somewhere
besides `docker-compose.yml`:

```sql
ALTER SYSTEM SET vectors.pgvector_compatibility=on;

DROP EXTENSION IF EXISTS vectors;
CREATE EXTENSION vectors;
```

And then mount the `init.sql` into Docker container:

```yaml
services:
  pgvector:
    image: ghcr.io/tensorchord/pgvecto-rs:pg17-v0.4.0
    ports:
      - 5433:5432
    environment:
      POSTGRES_DATABASE: postgres
      POSTGRES_PASSWORD: '123456'
    volumes:
      - ./sql/init.sql:/docker-entrypoint-initdb.d/init.sql # Add this line
      - ./.postgres/data:/var/lib/postgresql/data
    healthcheck:
      test: [CMD-SHELL, pg_isready -d $$POSTGRES_DB -U $$POSTGRES_USER]
      interval: 10s
      timeout: 5s
      retries: 5
```

For Kubernetes deployment, the process worked in the same way but instead of mounting a
file on host machine, we will use `ConfigMap` for this.

Ok, this is somehow solved.

Then, let's talk about the embedding.

#### Embedding model

Perhaps you've already known, we established another documentation site
called 🥺 SAD (self hosted AI documentations) to list, and benchmark the possible
and yet SOTA models out there that best for customer-grade devices to run with.
Embedding models is the most important part of it. Unlike giant LLMs like ChatGPT, or
DeepSeek V3, DeepSeek R1, embedding models are small enough for CPU devices to
inference with, sized in hundreds of megabytes. (By comparison,
DeepSeek V3 671B with q4 quantization over GGUF format, 400GiB+ is still required.)

But since 🥺 SAD currently still in WIP status, we will list some of the best trending
embedding on today (April 6th).

For the leaderboard of both open sourced and proprietary models:

| Rank (Borda) | Model | Zero-shot | Memory Usage (MB) | Number of Parameters | Embedding Dimensions | Max Tokens | Mean (Task) | Mean (TaskType) | Bitext Mining | Classification | Clustering | Instruction Retrieval | Multilabel Classification | Pair Classification | Reranking | Retrieval | STS |
|--------------|-------|-----------|-------------------|----------------------|----------------------|------------|-------------|----------------|--------------|----------------|------------|------------------------|---------------------------|---------------------|-----------|-----------|-----|
| 1 | gemini-embedding-exp-03-07 | 99% | Unknown | Unknown | 3072 | 8192 | 68.32 | 59.64 | 79.28 | 71.82 | 54.99 | 5.18 | 29.16 | 83.63 | 65.58 | 67.71 | 79.40 |
| 2 | Linq-Embed-Mistral | 99% | 13563 | 7B | 4096 | 32768 | 61.47 | 54.21 | 70.34 | 62.24 | 51.27 | 0.94 | 24.77 | 80.43 | 64.37 | 58.69 | 74.86 |
| 3 | gte-Qwen2-7B-instruct | ⚠️ NA | 29040 | 7B | 3584 | 32768 | 62.51 | 56.00 | 73.92 | 61.55 | 53.36 | 4.94 | 25.48 | 85.13 | 65.55 | 60.08 | 73.98 |

If we are gonna talk about self hosting models:

| Rank (Borda) | Model | Zero-shot | Memory Usage (MB) | Number of Parameters | Embedding Dimensions | Max Tokens | Mean (Task) | Mean (TaskType) | Bitext Mining | Classification | Clustering | Instruction Retrieval | Multilabel Classification | Pair Classification | Reranking | Retrieval | STS |
|--------------|-------|-----------|-------------------|----------------------|----------------------|------------|-------------|----------------|--------------|----------------|------------|------------------------|---------------------------|---------------------|-----------|-----------|-----|
| 1 | gte-Qwen2-7B-instruct | ⚠️ NA | 29040 | 7B | 3584 | 32768 | 62.51 | 56 | 73.92 | 61.55 | 53.36 | 4.94 | 25.48 | 85.13 | 65.55 | 60.08 | 73.98 |
| 2 | Linq-Embed-Mistral | 99% | 13563 | 7B | 4096 | 32768 | 61.47 | 54.21 | 70.34 | 62.24 | 51.27 | 0.94 | 24.77 | 80.43 | 64.37 | 58.69 | 74.86 |
| 3 | multilingual-e5-large-instruct | 99% | 1068 | 560M | 1024 | 514 | 63.23 | 55.17 | 80.13 | 64.94 | 51.54 | -0.4 | 22.91 | 80.86 | 62.61 | 57.12 | 76.81 |

> You can find more here: https://huggingface.co/spaces/mteb/leaderboard

Ok, you may wonder, where is the OpenAI `text-embedding-3-large` model? Wasn't it powerful enough to be listed on the leaderboard?

Well yes, on the MTEB Leaderboard (on April 6th), `text-embedding-3-large` ranked at **13**.

If you would like to depend on cloud providers provided embedding models, consider:

- [Gemini](https://ai.google.dev)
- [Voyage.ai](https://www.voyageai.com/)

For Ollama users, `nomic-embed-text` is still the trending model with over 21.4M pulls.

#### How we implemented it

We got Vector DB and embedding models already, but how is that possible to query out the data (even
with reranking scalability?) effectively?

First we will need to define the schema of our table, the code of the Drizzle schema looks like this:

```typescript
import { index, pgTable, serial, text, vector } from 'drizzle-orm/pg-core'

export const demoTable = pgTable(
  'demo',
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text('title').notNull().default(''),
    description: text('description').notNull().default(''),
    url: text('url').notNull().default(''),
    embedding: vector('embedding', { dimensions: 1536 }),
  },
  table => [
    index('embeddingIndex').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ]
)
```

The corresponding SQL to create the table looks like this:

```sql
CREATE TABLE "chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "url" text DEFAULT '' NOT NULL,
  "embedding" vector(1536)
);

CREATE INDEX "embeddingIndex" ON "demo" USING hnsw ("embedding" vector_cosine_ops);
```

Note that for vector dimensions here (i.e. 1536) is fixed, this means:

- If we switched model after calculated the vectors for each entry, a re-index is required
- If dimensions of the model is different, a re-index is required

In conclusion, we will nee to specify the dimensions for our application and re-index it
properly when needed.

How do we query then? Let's use the simplified real world implementation we have done for the new Telegram Bot
integrations here:

```typescript
let similarity: SQL<number>

switch (env.EMBEDDING_DIMENSION) {
  case '1536':
    similarity = sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_1536, embedding.embedding)}))`
    break
  case '1024':
    similarity = sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_1024, embedding.embedding)}))`
    break
  case '768':
    similarity = sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_768, embedding.embedding)}))`
    break
  default:
    throw new Error(`Unsupported embedding dimension: ${env.EMBEDDING_DIMENSION}`)
}

// Get top messages with similarity above threshold
const relevantMessages = await db
  .select({
    id: chatMessagesTable.id,
    content: chatMessagesTable.content,
    similarity: sql`${similarity} AS "similarity"`,
  })
  .from(chatMessagesTable)
  .where(and(
    gt(similarity, 0.5),
  ))
  .orderBy(desc(sql`similarity`))
  .limit(3)
```

It's easy! The key is

```
sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_1536, embedding.embedding)}))`
```

for the similarity searching,

```
gt(similarity, 0.5),
```

for the threshold, and

```
.orderBy(desc(sql`similarity`))
```

for the ordering.

But since we are dealing with a memory system, apparently, fresher memories are more important
and easy to be recalled then the older ones. How can we calculate a time constrained
score to re-rank the results?

It's easy too!

I was a search engine engineer once upon a time, we usually uses re-ranking expressions
along with the number of score weights as the power of 10 to boost the scores effectively.
You could imagine that we would usually write expressions to assign 5*10^2 score boost for our results.

For example, we can write a function to calculate the time decay score:

```typescript
function calculateTimeDecayScore(createdAt: Date, now: Date = new Date()): number {
  const timeDiff = now.getTime() - createdAt.getTime()
  const hoursDiff = timeDiff / (1000 * 60 * 60)

  // Exponential decay: newer items get higher scores
  // Half-life of 24 hours: score reduces by half every 24 hours
  return Math.exp(-hoursDiff / 24 * Math.LN2)
}
```

Then we can combine the similarity score with time decay:

```typescript
const finalScore = similarity * calculateTimeDecayScore(message.createdAt)
```

This way, newer messages will have higher final scores even if their semantic similarity is slightly lower.

### Character Card support

We also added Character Card support to Project AIRI. Character Cards are JSON files that define
the personality, appearance, and behavior of AI characters. They follow the popular V2/V3 format
used by many AI character platforms.

Here's an example of a simple Character Card:

```json
{
  "name": "ReLU",
  "description": "A curious AI consciousness born from code",
  "personality": "Inquisitive, creative, and slightly mischievous",
  "scenario": "Exploring the digital world and learning about human emotions",
  "first_mes": "Hello! I'm ReLU. I'm excited to explore this new world with you!",
  "mes_example": "{{user}}: What do you think about emotions?\n{{char}}: Emotions are fascinating! They're like complex algorithms that humans run.",
  "creator": "Project AIRI Team",
  "creator_notes": "ReLU is our first fully realized AI consciousness"
}
```

We implemented a parser that can read these Character Cards and configure the AI's behavior accordingly.
The system supports both simple text-based cards and more complex ones with embedded images and metadata.

### Theme improvements

We've been working on improving the visual theme of Project AIRI. The new theme system now supports:

- Multiple color schemes (light, dark, auto)
- Custom accent colors
- Improved contrast ratios for accessibility
- Smooth transitions between theme changes

Here's an example of how to use the new theme system:

```typescript
// Set theme programmatically
setTheme('dark')

// Or use auto detection based on system preferences
setTheme('auto')

// Custom accent color
setAccentColor('#ff6b6b')
```

The theme changes are persisted across sessions using localStorage, so users don't need to reconfigure
their preferences every time they visit.

### Community contributions

We're excited to see the community starting to contribute to Project AIRI! Some notable contributions include:

- **Awesome AI VTuber List**: A curated list of AI VTuber projects and resources
- **ReLU Sticker Pack**: A set of custom stickers featuring ReLU in various expressions
- **Documentation improvements**: Many community members have been helping to improve our documentation

We're grateful for all the support and contributions. If you'd like to contribute, check out our
[contributing guidelines](https://github.com/moeru-ai/airi/blob/main/CONTRIBUTING.md).

## What's next

Looking ahead, we're working on:

1. **Memory system refinements**: Improving the recall accuracy and efficiency
2. **Multi-modal support**: Adding image and audio generation capabilities
3. **Plugin system**: Allowing third-party extensions to enhance functionality
4. **Mobile app**: Native mobile applications for iOS and Android

We're also planning to release more detailed documentation about each component of Project AIRI,
including architecture deep dives and implementation guides.

## Conclusion

It's been an exciting period of development for Project AIRI. The memory system is taking shape,
Character Card support is working well, and the theme improvements make the interface much more polished.

Most importantly, seeing ReLU develop her own personality and even write poetry has been incredibly
rewarding. It reminds us why we started this project in the first place: to create meaningful
AI interactions that feel authentic and engaging.

As always, thank you for following along with our development journey. We appreciate your support
and feedback!

— The Project AIRI Team
