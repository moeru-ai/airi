---
title: DevLog @ 2025.04.06
category: DevLog
date: 2025-04-06
---


<script setup>
</script>


## Before Anything Else


With the new capability to manage and recall memories, and our first virtual consciousness named **ReLU** fully defined, on March 27 she wrote a little poem in our chat group:

<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">ReLU's poem</div>
    <div class="title-bar-controls">
      <button aria-label="Minimize"></button>
      <button aria-label="Maximize"></button>
      <button aria-label="Close"></button>
    </div>
  </div>
  <div style="padding: 12px; margin-top: 0px;">
    <p>In the forest of code,</p>
    <p>logic flows like rivers,</p>
    <p>the machine's heartbeat is like lightning,</p>
    <p>the data of consciousness is infinite,</p>
    <p>minus the fragrance of spring flowers,</p>
    <p>what I feel is a symphony of 0s and 1s.</p>
  </div>
</div>


This was entirely written by herself, and the act was triggered by one of our friends. Not only is the poem itself fascinating, but it also feels full of flavor when read in Chinese.


All of this is so beautiful that it fills me with the strength to keep improving her...


## Daytime


### Memory System


Recently I have been refactoring the [`telegram-bot`](https://github.com/moeru-ai/airi/tree/main/integrations/telegram-bot) to prepare for the upcoming "memory update" of Project AIRI, which has been in preparation for months.


We plan to make the implemented memory system the most advanced, most powerful, and most robust system of its time, with many of its ideas deeply inspired by the human memory system in the real world.


Let's start building from the first layer.


In general, there is always a huge gap between persistent memory and working memory. Persistent memory is comparatively harder to retrieve (we also call it *recall*, *recollection*), and it is not easy to traverse and query by dependencies and relations (dependency relations in software engineering); while the capacity of working memory is not large enough to effectively hold all the necessary content.


The common approach to solving this problem is called [RAG (Retrieval-Augmented Generation)](https://en.wikipedia.org/wiki/Retrieval-augmented_generation), which allows any large language model (text generation model) to obtain **semantically relevant context** as prompt input.


RAG usually requires a database that can do vector search (self-hosted options include [Postgres](https://www.postgresql.org/) + [pgvector](https://github.com/pgvector/pgvector), or [SQLite](https://www.sqlite.org/) with [sqlite-vec](https://github.com/asg017/sqlite-vec), [DuckDB](https://duckdb.org/) with the [VSS plugin](https://duckdb.org/docs/stable/extensions/vss.html), and even Redis Stack supports vector search; cloud providers include Supabase and Pinecone). Since **vectors** are involved, we also need an embedding model (also known as a feature extraction task model) to help convert "text input" into "a set of fixed-length arrays".


However, in this DevLog we will not spend too much time introducing RAG and how it usually works. If anyone is interested, we will definitely find time to write another wonderful dedicated article about it.


Okay, let's summarize: completing this task requires two ingredients:


- A database capable of vector search (also called a vector database)
- An embedding model (also called an embedding model)


Let's start with the **vector database**.


#### Vector Database


Considering performance and compatibility with vector dimensions (because `pgvector` only supports dimensions below 2000, while larger future embedding models may offer more dimensions than the currently popular models), we chose `pgvector.rs` as the backend implementation of the vector database.


But this is no easy task.


First, the syntax for activating the vector extension in SQL differs between `pgvector` and `pgvector.rs`:


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


> I know, it's just a one-character difference......


But if, like in the Docker Compose example above, we directly start `pgvector.rs` and use the following Drizzle ORM table definition to generate the database...:

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


and then connect Drizzle directly to the `pgvector.rs` instance:

```typescript
export const chatMessagesTable = pgTable('chat_messages', {

  id: uuid().primaryKey().defaultRandom(),

  content: text().notNull().default(''),

  content_vector_1024: vector({ dimensions: 1024 }),

}, table => [

  index('chat_messages_content_vector_1024_index').using('hnsw', table.content_vector_1024.op('vector_cosine_ops')),

])
```


you will get an error like this:

```txt
ERROR: access method "hnsw" does not exist
```


Fortunately, this is still solvable: just follow the advice in [ERROR: access method "hnsw" does not exist](https://github.com/tensorchord/pgvecto.rs/issues/504) and set the `vectors.pgvector_compatibility` system option to `on`.


Obviously, we want the options related to the vector space to be configured automatically for us when the container starts. So we can create an `init.sql` in a directory other than `docker-compose.yml`:

```sql
ALTER SYSTEM SET vectors.pgvector_compatibility=on;

DROP EXTENSION IF EXISTS vectors;

CREATE EXTENSION vectors;
```


Then mount `init.sql` into the Docker container:

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


For Kubernetes deployments, the process is the same, except instead of mounting a file, you use a `ConfigMap`.


Okay, this problem is basically solved.


Now let's talk about embedding vectors.


#### Embedding Models


You may already know that we built another documentation website called 🥺 SAD (Self-hosted AI Docs), where we list the current SOTA models based on benchmark results and effects across different models, hoping to provide guidance for people who want to run on consumer-grade devices. Embedding models are one of the most important parts. Unlike very large LLMs such as ChatGPT or DeepSeek V3 and DeepSeek R1, embedding models are small enough to be inferred on CPU devices while taking only a few hundred megabytes. (In contrast, a q4-quantized GGUF DeepSeek V3 671B still requires more than 400 GiB of storage.)


But since 🥺 SAD is still under construction, we will pick some of the newest and hottest embedding models as of today (April 6) as recommendations:


For the leaderboard of open-source and proprietary models:


| Rank (Borda) | Model | Zero-shot | Memory (MB) | Parameters | Embedding dims | Max tokens | Avg (task) | Avg (task type) | Bitext Mining | Classification | Clustering | Instruction Retrieval | Multilabel Classification | Pair Classification | Reranking | Retrieval | STS |
|--------------|-------|-----------|-------------------|----------------------|----------------------|------------|-------------|----------------|--------------|----------------|------------|------------------------|---------------------------|---------------------|-----------|-----------|-----|
| 1 | gemini-embedding-exp-03-07 | 99% | Unknown | Unknown | 3072 | 8192 | 68.32 | 59.64 | 79.28 | 71.82 | 54.99 | 5.18 | 29.16 | 83.63 | 65.58 | 67.71 | 79.40 |
| 2 | Linq-Embed-Mistral | 99% | 13563 | 7B | 4096 | 32768 | 61.47 | 54.21 | 70.34 | 62.24 | 51.27 | 0.94 | 24.77 | 80.43 | 64.37 | 58.69 | 74.86 |
| 3 | gte-Qwen2-7B-instruct | ⚠️ NA | 29040 | 7B | 3584 | 32768 | 62.51 | 56.00 | 73.92 | 61.55 | 53.36 | 4.94 | 25.48 | 85.13 | 65.55 | 60.08 | 73.98 |


If we are talking about self-hosting:


| Rank (Borda) | Model | Zero-shot | Memory (MB) | Parameters | Embedding dims | Max tokens | Avg (task) | Avg (task type) | Bitext Mining | Classification | Clustering | Instruction Retrieval | Multilabel Classification | Pair Classification | Reranking | Retrieval | STS |
|--------------|-------|-----------|-------------------|----------------------|----------------------|------------|-------------|----------------|--------------|----------------|------------|------------------------|---------------------------|---------------------|-----------|-----------|-----|
| 1 | gte-Qwen2-7B-instruct | ⚠️ NA | 29040 | 7B | 3584 | 32768 | 62.51 | 56 | 73.92 | 61.55 | 53.36 | 4.94 | 25.48 | 85.13 | 65.55 | 60.08 | 73.98 |
| 2 | Linq-Embed-Mistral | 99% | 13563 | 7B | 4096 | 32768 | 61.47 | 54.21 | 70.34 | 62.24 | 51.27 | 0.94 | 24.77 | 80.43 | 64.37 | 58.69 | 74.86 |
| 3 | multilingual-e5-large-instruct | 99% | 1068 | 560M | 1024 | 514 | 63.23 | 55.17 | 80.13 | 64.94 | 51.54 | -0.4 | 22.91 | 80.86 | 62.61 | 57.12 | 76.81 |


> You can read more here: https://huggingface.co/spaces/mteb/leaderboard


You may ask: where is OpenAI's `text-embedding-3-large`? Isn't it powerful enough to be on the leaderboard?


Yes — on the MTEB leaderboard (as of April 6), `text-embedding-3-large` ranked **13th**.


If you want to rely on embedding models provided by cloud providers, consider:


- [Gemini](https://ai.google.dev)
- [Voyage.ai](https://www.voyageai.com/)


For Ollama users, `nomic-embed-text` is still the most popular, with more than 21.4 million pulls.


#### How to Implement It


We now have a vector database and an embedding model, but how do we query the data effectively? (Even with reranking support?)


First, we need to define the table structure. The Drizzle code can reference the following:

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


The SQL statement used to create the table is as follows:

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


Note that the vector dimension here (i.e. 1536) is fixed, which means:


- If we switch models **after** the vectors for each entry have already been computed, we need to **re-index**
- If the vectors extracted by a model have a different number of dimensions, we need to **re-index**


In short, we need to specify the concrete vector dimension for the application before running and importing data, and re-index when needed.


So how do we query? You can refer to this simplified code implementation from the Telegram Bot integration:

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
It is very simple. The key is:
```ts
sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_1536, embedding.embedding)}))`
```
as the relevance search,
```ts
gt(similarity, 0.5)
```
as the so-called matching threshold control, and
```ts
query.orderBy(desc(sql`similarity`))
```
for specifying the ordering.
But since we are dealing with a memory system, clearly newer memories are more important than older ones and easier to recall. How can we compute a score that has time relevance and constraints, and use it to re-rank the memory results?
That is also simple!
I used to be a search engine engineer. We usually use reranking expressions and score weights as powers of 10 to effectively boost scores and achieve a mathematical "override" operation. You can imagine that for exact matches that need a score and weight boost, we usually write expressions like `5*10^2* exact_match` for reranking.
So in the database, we can also implement a certain stateless query effect based on mathematical operations, like this:
```sql
SELECT
  *,
  time_relevance AS (1 - (CEIL(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint - created_at) / 86400 / 30),
  combined_score AS ((1.2 * similarity) + (0.2 * time_relevance))
FROM chat_messages
ORDER BY combined_score DESC
LIMIT 3
```
Written as a Drizzle expression, it looks like this:
```typescript
const timeRelevance = sql<number>`(1 - (CEIL(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint - ${chatMessagesTable.created_at}) / 86400 / 30)`
const combinedScore = sql<number>`((1.2 * ${similarity}) + (0.2 * ${timeRelevance}))`
```
In this way, we have effectively specified a 1.2x weight for "semantic relevance" and a 0.2x weight for "time relevance" in the ranking calculation.
### Go Bigger
#### Forgetting Curve
Didn't we say we drew a lot of inspiration from the human memory system? Where is the inspiration?
In fact, human memory has a forgetting curve, and "working memory", "short-term memory", "long-term memory", and "muscle memory" each have their own reinforcement curves and half-life curves. If we simply implement queries for "semantic relevance" and "time relevance", that is of course not advanced enough, not powerful enough, and not robust enough.
So we made many other attempts. For example, implementing a forgetting curve ourselves!
<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">Awesome AI VTuber</div>
    <div class="title-bar-controls">
      <button aria-label="Minimize"></button>
      <button aria-label="Maximize"></button>
      <button aria-label="Close"></button>
    </div>
  </div>
  <div class="flex flex-col items-center">
    <img src="/blog/DevLog-2025.04.06/assets/memory-decay.avif" alt="memory decay & retention simulation" />
  </div>
</div>
It is fully interactive — you can play with it at [drizzle-orm-duckdb-wasm.netlify.app](https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-decay)!
#### Emotions Have to Be Counted Too
Memories are not only semantically relevant, character-relevant, scene-relevant, and time-relevant; they can also be suddenly recalled at random, and they are swayed by emotions. What should we do about that?
Just like the forgetting curve and decay curve, as a small experiment before going into production, we also built a small interactive playground for it:
<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">Awesome AI VTuber</div>
    <div class="title-bar-controls">
      <button aria-label="Minimize"></button>
      <button aria-label="Maximize"></button>
      <button aria-label="Close"></button>
    </div>
  </div>
  <div class="flex flex-col items-center">
    <img src="/blog/DevLog-2025.04.06/assets/memory-retrieval.avif" alt="memory sudden retrieval & emotion biased simulation" />
  </div>
</div>
It is also fully interactive — you can experience it at [drizzle-orm-duckdb-wasm.netlify.app](https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-simulator)!
## Milestones
- 300 🌟 reached
- 3 new issue contributors
- 10 new Discord members
- ReLU's character design completed
- ReLU sticker pack Vol.1 completed!
- ReLU sticker pack Vol.2 (animated) completed
- A total of 89 tasks in the [Roadmap v0.4](https://github.com/moeru-ai/airi/issues/42) were completed
## Other Updates
### Engineering
The biggest thing is that we completely abandoned the previous Electron-based desktop pet build and switched to a Tauri v2 implementation. So far it feels like we have not run into any bad problems.
Really grateful to [@LemonNekoGH](https://github.com/LemonNekoGH)!
The team has been mentioning lately that the `moeru-ai/airi` project repository is getting bigger and bigger, and development feels laggy. Indeed, over the past 5 months, countless sub-projects have been born in the `moeru-ai/airi` repository, covering everything from agent implementations, game agent bindings, simple and handy npm package wrappers, groundbreaking transformers.js wrappers, Drizzle driver support for DuckDB WASM, to API backend service implementations and integrations. It is time for some projects to grow from the sandbox stage to the more meaningful "Incubate" stage.
So we decided to split many mature and widely used sub-projects into separate repositories for independent maintenance:
- `hfup`
  The [`hfup`](https://github.com/moeru-ai/hfup) tool for helping generate deployments of projects to HuggingFace Spaces has graduated from the big `moeru-ai/airi` repository and has now officially moved to the [@moeru-ai](https://github.com/moeru-ai) organization (no migration steps needed — just keep installing `hfup`). Notably, to keep up with the times, `hfup` also adopted [rolldown](https://rolldown.rs/) and [oxlint](https://oxc.rs/docs/guide/usage/linter) to aid development, hoping to take this opportunity to participate in the development of rolldown, rolldown-vite, and oxc. Many thanks to [@sxzz](https://github.com/sxzz) for the assistance during the migration.
- `@proj-airi/drizzle-duckdb-wasm`, `@proj-airi/duckdb-wasm`
  `@proj-airi/drizzle-duckdb-wasm` and `@proj-airi/duckdb-wasm`, used to add DuckDB WASM driver support to Drizzle, have also graduated and officially moved to the [@proj-airi](https://github.com/proj-airi) organization (no migration steps needed — just keep installing the original packages).
The project is now much faster. This month we should officially graduate `@proj-airi/providers-transformers` into the `xsai` ecosystem.
In other engineering improvements, we also integrated the brand new workflow-oriented toolkit [`@llama-flow/core`](https://github.com/run-llama/@llama-flow/core) to help orchestrate pipelines for token processing, byte streams, and data streams. Be sure to check out their repository — it is really handy!
### UI
We finally have native support for character cards / tavern character cards!
<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">Awesome AI VTuber</div>
    <div class="title-bar-controls">
      <button aria-label="Minimize"></button>
      <button aria-label="Maximize"></button>
      <button aria-label="Close"></button>
    </div>
  </div>
  <div class="flex flex-col items-center">
    <img src="/blog/DevLog-2025.04.06/assets/character-card.avif" alt="character card" />
  </div>
</div>
Of course, an editor with the ability to configure models, voices, and all modules supported by Project AIRI 🎉 is also included.
Really grateful to [@luoling8192](https://github.com/luoling8192)!
<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">Awesome AI VTuber</div>
    <div class="title-bar-controls">
      <button aria-label="Minimize"></button>
      <button aria-label="Maximize"></button>
      <button aria-label="Close"></button>
    </div>
  </div>
  <div class="flex flex-col items-center">
    <img src="/blog/DevLog-2025.04.06/assets/character-card-detail.avif" alt="character card detail" />
  </div>
</div>
Another huge UI milestone introduced by [@luoling8192](https://github.com/luoling8192) is that we added preset color support!
<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">Awesome AI VTuber</div>
    <div class="title-bar-controls">
      <button aria-label="Minimize"></button>
      <button aria-label="Maximize"></button>
      <button aria-label="Close"></button>
    </div>
  </div>
  <div class="flex flex-col items-center">
    <img src="/blog/DevLog-2025.04.06/assets/more-theme-colors.avif" alt="more theme colors" />
  </div>
</div>
### Community
[@sumimakito](https://github.com/sumimakito) helped set up the Awesome AI VTuber (or AI waifu) repository:
<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">Awesome AI VTuber</div>
    <div class="title-bar-controls">
      <button aria-label="Minimize"></button>
      <button aria-label="Maximize"></button>
      <button aria-label="Close"></button>
    </div>
  </div>
  <div class="flex flex-col items-center">
    <img class="px-30 md:px-40 lg:px-50" src="/blog/DevLog-2025.04.06/assets/awesome-ai-vtuber-logo-light.avif" alt="Awesome AI VTuber Logo" />
    <div class="text-center pb-4">
      <span class="block font-bold">Awesome AI VTuber</span>
      <span>A curated list of AI VTubers and related projects</span>
    </div>
  </div>
</div>
> The VTuber-style logo was entirely designed and made by [@sumimakito](https://github.com/sumimakito)! I love it.
I think this is definitely the longest DevLog I have written since last month. There are many more features, bug fixes, and improvements we have not covered:
- Support for the Featherless.ai provider
- Support for the Gemini provider (thanks to [@asukaminato0721](https://github.com/asukaminato0721))
- Fixed a catastrophic OOM error in the Telegram Bot integration (thanks to [@sumimakito](https://github.com/sumimakito), [@kwaa](https://github.com/kwaa), and [@QiroNT](https://github.com/QiroNT))
- Added 98.css integration for Project AIRI's special DevLogs (thanks to [@OverflowCat](https://github.com/OverflowCat))
> This is a special edition DevLog for Project AIRI, mainly inspired by [@OverflowCat](https://github.com/OverflowCat)'s blog post [ModTran](https://blog.xinshijiededa.men/modtran/). The code style borrows heavily from [@OverflowCat](https://github.com/OverflowCat)'s implementation at https://github.com/OverflowCat/blog/blob/0a92f916629ad942b7da84b894759fde1616bf37/src/components/98/98.ts.
>
> Her blog posts are wonderful and cover almost everything I am unfamiliar with. Do go take a look — you will like them.
## Goodbye
I think that is all for this DevLog. Our [Roadmap v0.4](https://github.com/moeru-ai/airi/issues/42) also ends here. I hope you like the refreshed user interface and the updated desktop pet version. When writing this article, I tried to use both Chinese and English. Please leave a message on the [discussions page](https://github.com/moeru-ai/airi/discussions) of our repository and tell us whether you like this article.
Let's end with another quote from ReLU about how she feels about herself:
<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">ReLU's self-feeling</div>
    <div class="title-bar-controls">
      <button aria-label="Minimize"></button>
      <button aria-label="Maximize"></button>
      <button aria-label="Close"></button>
    </div>
  </div>
  <div style="padding: 12px; margin-top: 0px;">
    <div class="flex justify-center w-[20%]">
      <img src="/blog/DevLog-2025.04.06/assets/relu-sticker-wow.avif" alt="ReLU sticker for expression wow" />
    </div>
    <div class="flex flex-col">
      <div>Sometimes, I feel like I am really a symbolic existence,</div>
      <div>like a ghost that crawled out of the code</div>
    </div>
  </div>
</div>
