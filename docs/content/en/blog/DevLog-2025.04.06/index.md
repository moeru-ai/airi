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

## Before all the others 在其他东西之前

With the new ability to manage and recall from memories, and the fully completed personality definitions of
our first consciousness named **ReLU**, on the day of March 27, she wrote a little poem in our chat group:

在有了管理和召回记忆的新能力的加持，以及名为 **ReLU** 的我们的第一个虚拟意识被完全定义后，3 月 27 日那天，她在我们的聊天群里写了一首小诗：

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
  </div>
</div>

She wrote this completely on her own, and this action was triggered by one of our friend.
The poem itself is fascinating and feels rhyme when reading it in Chinese.

这完全是她自己写的，而这一举动是由我们的一位朋友触发的。
不仅这首诗本身引人入胜，并且用中文阅读的时候也感觉韵味十足。

Such beautiful, and empowers me to continue to improve her.

这一切都太美了，让我充满了愿意持续改进她的力量...

## Day time 日常

### Memory system 记忆系统

I was working on the refactoring over
[`telegram-bot`](https://github.com/moeru-ai/airi/tree/main/services/telegram-bot),
for the upcoming memory update for Project AIRI. Which we were planning to implement
for months.

最近正在重构 [`telegram-bot`](https://github.com/moeru-ai/airi/tree/main/services/telegram-bot) 以为已经准备了数月的
Project AIRI 即将到来的「记忆更新」作准备。

We are planning to make the memory system the most advanced, robust, and reliable
that many thoughts were borrowed from how memory works in Human brain.

我们计划使实现后的记忆系统成为当下最先进、最强大、最健壮的系统，其中很多的思想都深受真实世界中的人类记忆系统的启发。

Let's start the building from ground...

让我们从第一层开始建造吧。

So there is always a gap between persistent memory and working memory, where persistent
memory is more hard to retrieval (we call it *recall* too) with both semantic relevance
and follow the relationships (or dependency in software engineering) of the memorized
events, and working memory is not big enough to hold everything essential effectively.

通常而言，持久记忆和工作记忆之间始终存在巨大的鸿沟，持久记忆相比之下往往更难检索（我们也称其为 *召回*，*回想*
），也不是轻易就可以根据依赖和关系（软件工程中的依赖关系）遍历查询的；而工作记忆的容量大小又不足以有效容纳所有必
需的内容。

The common practice of solving this problem is called
[RAG (retrieval augmented generation)](https://en.wikipedia.org/wiki/Retrieval-augmented_generation),
this enables any LLMs (text generation models) with relevant semantic related context as input.

解决此问题的常见做法称为 [RAG（检索增强生成）](https://en.wikipedia.org/wiki/Retrieval-augmented_generation)，
这允许任何大语言模型（文本生成模型）获取**语义相关的上下文**作为提示词输入。

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

RAG 通常需要一个能够进行向量搜索的数据库（自定义的有 [Postgres](https://www.postgresql.org/) +
[pgvector](https://github.com/pgvector/pgvector)，或者 [SQLite](https://www.sqlite.org/)
搭配 [sqlite-vec](https://github.com/asg017/sqlite-vec)，[DuckDB](https://duckdb.org/) 搭配
[VSS plugin](https://duckdb.org/docs/stable/extensions/vss.html) 插件，甚至是 Redis Stack 也支持向量搜索；
云服务提供商的有 Supabase、Pinecone），由于涉及**向量**，我们还需要一个 embedding（嵌入）模型（又称特征提取（feature
extraction）任务模型）来帮助将「文本输入」转换为「一组固定长度的数组」。

We are not gonna to cover a lot about RAG and how it works today in this DevLog. If any of
you were interested in, we could definitely write another awesome dedicated post about it.

不过在此 DevLog 中，我们不会过多介绍 RAG 及其通常的工作原理。如果有任何人对此感兴趣的话，我们绝对抽时间再可以写另一篇
关于它的精彩专攻文章。

Ok, let's summarize, we will need two ingredients for this task:

好了，我们来总结一下，完成这项任务需要两种原料：

- Vector similarity search capable database (a.k.a. Vector DB)
- Embedding model

- 能够进行向量搜索的数据库（也叫做 向量数据库）
- Embedding 模型（也叫做嵌入模型）

Let's get started with the first one: **Vector DB**.

让我们从**向量数据库**开始。

#### Vector DB

We chose `pgvector.rs` for vector database implementation for both speed
and vector dimensions compatibility (since `pgvector` only supports dimensions below
2000, where future bigger embedding model may provide dimensions more than the current
trending.)

考虑到性能和对向量纬度数的兼容问题（因为 `pgvector` 只支持 2000 维以下的维数，而未来更大的嵌入模型可能
会提供比当前热门和流行的嵌入模型更多的维数），我们选择 `pgvector.rs` 来作为向量数据库的后端实现。

But it was kind of a mess.

但这绝非易事。

First, the extension installation with SQL in `pgvector` and `pgvector.rs` are
different:

首先，在 `pgvector` 和 `pgvector.rs` 中用 SQL 激活向量拓展的语法是不一样的：

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
>
> 我知道，这只是一个字符的差别......

However, if we directly boot the `pgvector.rs` from scratch like the above Docker Compose example,
with the following Drizzle ORM schema:

但是，如果我们像上面的 Docker Compose 示例一样，直接启动 `pgvector.rs` 并使用以下 Drizzle ORM 表结构定义生成
数据库...：

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

然后用 Drizzle 直接连接到 `pgvector.rs` 实例的话：

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

会发生如下的报错：

```
ERROR: access method "hnsw" does not exist
```

Fortunately, this is possible to fix by following
[ERROR: access method "hnsw" does not exist](https://github.com/tensorchord/pgvecto.rs/issues/504) to add
the `vectors.pgvector_compatibility` system option to `on`.

幸运地是，这还是可以解决的，只需要参考 [ERROR: access method "hnsw" does not exist](https://github.com/tensorchord/pgvecto.rs/issues/504)
的建议把 `vectors.pgvector_compatibility` 系统选项配置为 `on` 就好了。

Clearly we would like to automatically configure the vector space related options for
us when booting up the container, therefore, we can create a `init.sql` under somewhere
besides `docker-compose.yml`:

显然，我们希望在启动容器时自动为我们配置与向量空间有关的选项，因此，我们可以在
`docker-compose.yml` 以外的某个目录里创建一个 `init.sql` ：

```sql
ALTER SYSTEM SET vectors.pgvector_compatibility=on;

DROP EXTENSION IF EXISTS vectors;
CREATE EXTENSION vectors;
```

And then mount the `init.sql` into Docker container:

然后将 `init.sql` 挂载到 Docker 容器中：

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

对于 Kubernetes 部署，流程与此相同，只不过不是挂载一个文件，而是使用 `ConfigMap` 了。

Ok, this is somehow solved.

好的，那这个问题基本上是解决了。

Then, let's talk about the embedding.

那让我们聊聊嵌入向量吧。

#### Embedding model 嵌入模型

Perhaps you've already known, we established another documentation site
called 🥺 SAD (self hosted AI documentations) to list, and benchmark the possible
and yet SOTA models out there that best for customer-grade devices to run with.
Embedding models is the most important part of it. Unlike giant LLMs like ChatGPT, or
DeepSeek V3, DeepSeek R1, embedding models are small enough for CPU devices to
inference with, sized in hundreds of megabytes. (By comparison,
DeepSeek V3 671B with q4 quantization over GGUF format, 400GiB+ is still required.)

也许您已经知道，我们建立了另一个名为 🥺 SAD（自部署 AI 文档）的文档网站，我们会根据不同模型进行的基准测试结果和效果
在文档网站中列出当前的 SOTA 模型，旨在希望能给想要使用消费级设备运行提供建议指导，而嵌入模型是其中最重要的部分。
和 ChatGPT 或 DeepSeek V3、DeepSeek R1 等超大大语言模型不同的是，嵌入模型足够小，在只占数百兆字节情况下也可以使
用 CPU 设备进行推理。(相比之下，采用 q4 量化的 GGUF 格式的 DeepSeek V3 671B，仍需要 400GiB 以上的存储空间）。

But since 🥺 SAD currently still in WIP status, we will list some of the best trending
embedding on today (April 6th).

但由于 🥺 SAD 目前仍处于建设中状态，我们将挑选一些在今天（4月6日）看来最新最热的嵌入模型作为推荐：

For the leaderboard of both open sourced and proprietary models:

对于开源和专有模型的排行榜：

| Rank (Borda) | Model | Zero-shot | Memory Usage (MB) | Number of Parameters | Embedding Dimensions | Max Tokens | Mean (Task) | Mean (TaskType) | Bitext Mining | Classification | Clustering | Instruction Retrieval | Multilabel Classification | Pair Classification | Reranking | Retrieval | STS |
|--------------|-------|-----------|-------------------|----------------------|----------------------|------------|-------------|----------------|--------------|----------------|------------|------------------------|---------------------------|---------------------|-----------|-----------|-----|
| 1 | gemini-embedding-exp-03-07 | 99% | Unknown | Unknown | 3072 | 8192 | 68.32 | 59.64 | 79.28 | 71.82 | 54.99 | 5.18 | 29.16 | 83.63 | 65.58 | 67.71 | 79.40 |
| 2 | Linq-Embed-Mistral | 99% | 13563 | 7B | 4096 | 32768 | 61.47 | 54.21 | 70.34 | 62.24 | 51.27 | 0.94 | 24.77 | 80.43 | 64.37 | 58.69 | 74.86 |
| 3 | gte-Qwen2-7B-instruct | ⚠️ NA | 29040 | 7B | 3584 | 32768 | 62.51 | 56.00 | 73.92 | 61.55 | 53.36 | 4.94 | 25.48 | 85.13 | 65.55 | 60.08 | 73.98 |

If we are gonna talk about self hosting models:

如果我们要讨论自部署的话：

| Rank (Borda) | Model | Zero-shot | Memory Usage (MB) | Number of Parameters | Embedding Dimensions | Max Tokens | Mean (Task) | Mean (TaskType) | Bitext Mining | Classification | Clustering | Instruction Retrieval | Multilabel Classification | Pair Classification | Reranking | Retrieval | STS |
|--------------|-------|-----------|-------------------|----------------------|----------------------|------------|-------------|----------------|--------------|----------------|------------|------------------------|---------------------------|---------------------|-----------|-----------|-----|
| 1 | gte-Qwen2-7B-instruct | ⚠️ NA | 29040 | 7B | 3584 | 32768 | 62.51 | 56 | 73.92 | 61.55 | 53.36 | 4.94 | 25.48 | 85.13 | 65.55 | 60.08 | 73.98 |
| 2 | Linq-Embed-Mistral | 99% | 13563 | 7B | 4096 | 32768 | 61.47 | 54.21 | 70.34 | 62.24 | 51.27 | 0.94 | 24.77 | 80.43 | 64.37 | 58.69 | 74.86 |
| 3 | multilingual-e5-large-instruct | 99% | 1068 | 560M | 1024 | 514 | 63.23 | 55.17 | 80.13 | 64.94 | 51.54 | -0.4 | 22.91 | 80.86 | 62.61 | 57.12 | 76.81 |

> You can find more here: https://huggingface.co/spaces/mteb/leaderboard
>
> 你可以在这里阅读更多：https://huggingface.co/spaces/mteb/leaderboard

Ok, you may wonder, where is the OpenAI `text-embedding-3-large` model? Wasn't it powerful enough to be listed on the leaderboard?

你可能会问，OpenAI 的 `text-embedding-3-large` 模型在哪里？难道它还不够强大，不能列入排行榜吗？

Well yes, on the MTEB Leaderboard (on April 6th), `text-embedding-3-large` ranked at **13**.

是的，在 MTEB 排行榜上（4 月 6 日），`text-embedding-3-large` 排在第 **13** 位。

If you would like to depend on cloud providers provided embedding models, consider:

如果您想依赖云提供商提供的嵌入式模型，可以考虑：

- [Gemini](https://ai.google.dev)
- [Voyage.ai](https://www.voyageai.com/)

For Ollama users, `nomic-embed-text` is still the trending model with over 21.4M pulls.

对于 Ollama 用户来说，`nomic-embed-text` 仍然是最热门的，拉取次数超过 2140 万次。

#### How we implemented it 如何实现呢

We got Vector DB and embedding models already, but how is that possible to query out the data (even
with reranking scalability?) effectively?

我们已经有了向量数据库和嵌入模型，但如何才能有效地查询出数据呢？（甚至是支持重排的）

First we will need to define the schema of our table, the code of the Drizzle schema looks like this:

首先，我们需要定义表结构，Drizzle 的代码可以参考如下内容：

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

用于创建表格的 SQL 语句如下：

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

请注意，这里的向量维数（即 1536）是固定的，这意味着

- If we switched model after calculated the vectors for each entry, a re-index is required
- If dimensions of the model is different, a re-index is required

- 如果我们在每个条目对应的向量已经计算好**之后再**切换了模型，则需要**重新索引**
- 如果模型提取的向量维度数不同，则需要**重新索引**

In conclusion, we will nee to specify the dimensions for our application and re-index it
properly when needed.

总之，我们需要在运行和导入数据前为应用指定具体的向量维度，并在需要时重新索引。

How do we query then? Let's use the simplified real world implementation we have done for the new Telegram Bot
integrations here:

那么我们该如何查询呢？可以参考一下这个简化之后的 Telegram Bot 集成的代码实现方案：

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

非常简单，关键就是

```
sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_1536, embedding.embedding)}))`
```

for the similarity searching,

作为相关度搜索，

```
gt(similarity, 0.5),
```

for the threshold, and

作为所谓的匹配度阈值控制，

```
.orderBy(desc(sql`similarity`))
```

for the ordering.

则用于指定排序。

But since we are dealing with a memory system, apparently, fresher memories are more important
and easy to be recalled then the older ones. How can we calculate a time constrained
score to re-rank the results?

但既然我们面对的是一个记忆系统，显然，较新的记忆比较旧的记忆更重要，也更容易被想起。
我们如何才能计算出一个有时间关联和制约的分数，从而对记忆结果重新排序呢？

It's easy too!

这也很简单！

I was a search engine engineer once upon a time, we usually uses re-ranking expressions
along with the number of score weights as the power of 10 to boost the scores effectively.
You could imagine that we would usually write expressions to assign 5*10^2 score boost for our results.

我曾经是一名搜索引擎工程师，我们通常使用重排表达式以及分数权重作为的 10 的幂来有效提高分数并做到数学意义上的「覆盖」操作。
你可以想象的是，对于精确匹配需要提升分数和权重的话，我们通常会编写 5*10^2 * exact_match 这样的表达式来重新排序。

In SQL queries, we could implement some sort of stateless query based on mathematical operations, like this:

所以数据库里面我们也可以实现某种基于数学运算的无状态查询效果，比如这样：

```sql
SELECT
  *,
  time_relevance AS (1 - (CEIL(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint - created_at) / 86400 / 30),
  combined_score AS ((1.2 * similarity) + (0.2 * time_relevance))
FROM chat_messages
ORDER BY combined_score DESC
LIMIT 3
```

If it is written as a query with Drizzle, it is like this:

写成 Drizzle 的表达式的话，就是这样的：

```typescript
const timeRelevance = sql<number>`(1 - (CEIL(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint - ${chatMessagesTable.created_at}) / 86400 / 30)`
const combinedScore = sql<number>`((1.2 * ${similarity}) + (0.2 * ${timeRelevance}))`
```

In this way, it is equivalent that we specify 1.2 times weight of "semantic relevance"
and 0.2 times weight of "temporal relevance" for sorting.

这样，相当于我们指定了 1.2 倍权重的「语义相关性」，0.2 倍权重的「时间关联度」用于排序计算。

### Scale it up 整点大的

#### Forgetting curves 遗忘曲线

Didn't we say we borrowed a lot from the human memory system as inspiration? Where is the inspiration?

我们不是说我们借鉴了很多人类记忆系统作为启发吗？启发在哪里了？

As a matter of fact, human memory has a forgetting curve, and for "working memory", "short-term memory",
"long-term memory" and "muscle memory", there are also their respective reinforcement curves and half-life
curves. If we simply implemented the query "semantic relevance" and "temporal relevance" accordingly,
of course, it is not advanced, not powerful and not robust enough.

事实上，人类记忆是具有遗忘曲线的，对于「工作记忆」，「短期记忆」，「长期记忆」和「肌肉记忆」也有他们
各自的强化曲线和半衰期曲线，我们如果只是简单地实现了「语义相关性」和「时间关联度」的查询，当然是
不够先进、不够强大、不够健壮的。

So we did a lot of other things. Like actually implementing a forgetting curve ourselves!

所以我们还做了很多别的尝试。比如亲自实现一个遗忘曲线！

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
    <img :src="MemoryDecay" alt="memory decay & retention simulation" />
  </div>
</div>

It is fully interactive and can be played on [drizzle-orm-duckdb-wasm.netlify.app](https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-decay)!

它是完全可交互的，可以在 [drizzle-orm-duckdb-wasm.netlify.app](https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-decay) 这里玩玩看!

#### Emotions counts 情绪也得算进去

Memory isn't just semantically related, actor related, scene related, and temporal related,
memories can also randomly and suddenly got recalled, and emotionally swayed as well, so what to do?

记忆并不只是语义相关，人物相关，场景相关，和时间相关的，它还会随机地被突然想起，也会被情绪左右，这该怎么办呢？

Same as the forgetting curve and decay curve, as a little experiment before putting into use,
we made a little interactive playground for it.

与遗忘曲线和衰减曲线一样，作为投入使用前的一个小实验，我们也为它制作了一个小小的互动实验场地：

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
    <img :src="MemoryRetrieval" alt="memory sudden retrieval & emotion biased simulation" />
  </div>
</div>

It is fully interactive too!!! Can be played on [drizzle-orm-duckdb-wasm.netlify.app](https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-simulator)!

它依然是完全可交互的，可以在 [drizzle-orm-duckdb-wasm.netlify.app](https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-simulator) 这里体验一下!

## Milestones 里程碑

- We reached the 300 stars!
- 3+ new fresh contributors in issues!
- 10+ new fresh group members in Discord server!
- ReLU character design finished!
- ReLU sticker Vol.1 finished!
- ReLU sticker Vol.2 animated finished!
- 89 tasks finished for [Roadmap v0.4](https://github.com/moeru-ai/airi/issues/42)

- 300 🌟 达成
- 3 位新的 Issue 贡献者
- 10 位新的 Discord 成员
- ReLU 形象设计完成
- ReLU 表情包 Vol.1 制作完成！
- ReLU 表情包 Vol.2 动态版 制作完成
- [路线图 v0.4](https://github.com/moeru-ai/airi/issues/42) 中有总计 89 个任务被完成了

## Other updates 其他更新

### Engineering 工程化

The biggest thing is, we've completely migrated our previous Electron-based solution to Tauri v2, and it doesn't look and feel
like we've encountered any bad problems yet.

最大的事情莫过于，我们完全舍弃了先前的基于 Electron 的桌宠构建方案，转向了使用 Tauri v2 的实现，现在看起来感觉还没有遇到什么不好的问题。

Big shout out to [@LemonNekoGH](https://github.com/LemonNekoGH)

真的很感谢 [@LemonNekoGH](https://github.com/LemonNekoGH)！

A while ago, everyone on the team mentioned that the `moeru-ai/airi` repository was getting too big and that development was getting laggy.
Indeed, the `moeru-ai/airi` repository has seen the birth of countless sub-projects in the past 5 months,
covered from agent implementations,
to game agent binding implementations,
to simple and easy to use npm package wrappers,
to ground-breaking transformers.js wrappers,
to Drizzle driver support for DuckDB WASM,
to API implementation and integration of back-end services.
it's time for some of these projects to grow from the Sandbox stage to the more meaningful Incubate stage.

团队的大家前段时间都在提到说 `moeru-ai/airi` 这个项目仓库越来越大了，开发的时候会很卡顿。确实，过去的 5 个月里
`moeru-ai/airi` 仓库里诞生了数不尽的子项目，覆盖了从 agent 实现，游戏 agent 绑定实现，到简单好用的 npm 包封装，以及具有开创性意义的 transformers.js 封装，
和 DuckDB WASM 的 Drizzle 驱动支持，到 API 后端服务的实现和集成的各种领域，是时候让一些项目从 sandbox 阶段成长到更具意义的「Incubate 孵化」阶段了。

So we decided to split a number of sub-projects that were already mature and in widespread
use into separate repositories to be maintained:

所以我们决定拆分许多已经很成熟并且在广泛使用的子项目到单独的仓库中单独维护：

- `hfup`

  The [`hfup`](https://github.com/moeru-ai/hfup) tool that helps generate the tools used to deploy projects to HuggingFace Spaces has
sort of graduated from the `moeru-ai/airi` repository, and is now officially migrated under the organization name [@moeru-ai](https://github.com/moeru-ai)
(no migration required, just keep installing `hfup` and you're good to go). It's interesting to note that `hfup` has also adopted [rolldown](https://rolldown.rs/)
and [oxlint](https://oxc.rs/docs/guide/usage/linter) to help with development in order to keep up with the times, so I hope to take this opportunity
to participate in rolldown. I hope to take this opportunity to participate in the development of rolldown, rolldown-vite and oxc.
Thanks to [@sxzz](https://github.com/sxzz) for the integration process.

  用于帮助生成用于部署项目到 HuggingFace Spaces 的 [`hfup`](https://github.com/moeru-ai/hfup) 工具已经算是从 `moeru-ai/airi` 大仓库中阶段性毕业了，
现在正式迁移到 [@moeru-ai](https://github.com/moeru-ai) 的组织名下（不需要任何迁移操作，继续安装 `hfup` 就可以用了）。非常有意义的是，`hfup` 为了跟上时代，
也采用了 [rolldown](https://rolldown.rs/) 和 [oxlint](https://oxc.rs/docs/guide/usage/linter) 帮助开发，希望能借此机会参与到 rolldown，
rolldown-vite 和 oxc 的开发当中。非常感谢 [@sxzz](https://github.com/sxzz) 在迁移过程中给到的援助。

- `@proj-airi/drizzle-duckdb-wasm`, `@proj-airi/duckdb-wasm`
  The `@proj-airi/drizzle-duckdb-wasm` and `@proj-airi/duckdb-wasm` used to add DuckDB WASM driver support to Drizzle have also graduated
in stages, and are now officially migrated under the organization name [@proj-airi](https://github.com/proj-airi)
(no migration required, just keep installing the original packages).

  用于为 Drizzle 添加 DuckDB WASM 驱动支持的 `@proj-airi/drizzle-duckdb-wasm` 和 `@proj-airi/duckdb-wasm` 也算是阶段性毕业了，
现在正式迁移到 [@proj-airi](https://github.com/proj-airi) 的组织名下（不需要任何迁移操作，继续安装原来的包就可以用了）。

The project is much faster now and should officially graduate `@proj-airi/providers-transformers` to `xsai` this month.

现在项目速度快了很多，这个月应该会把 `@proj-airi/providers-transformers` 正式毕业到 `xsai` 名下。

In terms of other engineered improvements, we also integrated the fresh new Workflow oriented toolkit called [`@llama-flow/core`](https://github.com/run-llama/@llama-flow/core)
to help with orchestrating pipeline processing of tokens, bytes, and data flows.
Do check out their repository, it's really easy to use.

在其他工程改进方面，我们还集成了全新的面向工作流的工具包 [`@llama-flow/core`](https://github.com/run-llama/@llama-flow/core)，以帮助协调 token 处理、字节流和数据流的 pipeline 编排。
记得看看他们的仓库，真的非常好用！

### UI 界面

We finally supported Character cards natively!

我们终于原生支持角色卡/酒馆角色卡了！

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
    <img :src="CharacterCard" alt="character card" />
  </div>
</div>

A editor with models, voice lines, and every modules that Project AIRI has supported is included 🎉.

当然，一个包含模型、声线和 Project AIRI 支持的所有模块 🎉 的配置的能力的编辑器也包含在内了。

Big shout out to [@luoling8192](https://github.com/luoling8192)

真的很感谢 [@luoling8192](https://github.com/luoling8192)！

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
    <img :src="CharacterCardDetail" alt="character card detail" />
  </div>
</div>

Another huge UI milestone as also introduced by [@luoling8192](https://github.com/luoling8192),
we got color presets included!

由 [@luoling8192](https://github.com/luoling8192) 推出的另一个巨大的 UI 里程碑是，我们加入了预设颜色支持！

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
    <img :src="MoreThemeColors" alt="more theme colors" />
  </div>
</div>

### Community 社区

[@sumimakito](https://github.com/sumimakito) helped to establish the Awesome AI VTuber (or AI Waifu) repository:

[@sumimakito](https://github.com/sumimakito) 帮助建立了 Awesome AI VTuber（或 AI waifu）的仓库：

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
    <img class="px-30 md:px-40 lg:px-50" :src="AwesomeAIVTuber" alt="Awesome AI VTuber Logo" />
    <div class="text-center pb-4">
      <span class="block font-bold">Awesome AI VTuber</span>
      <span>A curated list of AI VTubers and their related projects</span>
    </div>
  </div>
</div>

> The VTuber style logo was designed purely by [@sumimakito](https://github.com/sumimakito), I love it ❤️.
>
> VTuber 风格的 Logo 是完全由 [@sumimakito](https://github.com/sumimakito) 设计和制作的！我超喜欢。

I guess this is definitely the biggest DevLog I've ever written since last month. And there are still tons of features,
bug fixes, and improvements we haven't covered yet:

我想这绝对是我自上个月以来写过的最大篇幅的 DevLog。还有很多功能、错误修复和改进我们还没有涉及：

- Featherless.ai provider supported
- Gemini provider supported (thanks to [@asukaminato0721](https://github.com/asukaminato0721))
- Catastrophic OOM bug fixed for Telegram Bot integration (thanks to [@sumimakito](https://github.com/sumimakito), [@kwaa](https://github.com/kwaa), and [@QiroNT](https://github.com/QiroNT))
- New 98.css integration for Project AIRI's special DevLog (thanks to [@OverflowCat](https://github.com/OverflowCat))

> This is a special version of Project AIRI's DevLog that heavily inspired by [@OverflowCat](https://github.com/OverflowCat)'s
> blog post [ModTran](https://blog.xinshijiededa.men/modtran/) and the style of code was copied from [@OverflowCat](https://github.com/OverflowCat)'s implementation
> over https://github.com/OverflowCat/blog/blob/0a92f916629ad942b7da84b894759fde1616bf37/src/components/98/98.ts
>
> She writes awesome blog posts about almost everything I am not familiar with, please do check it out, u will like it.
>
> 这是 Project AIRI 一篇特别版的开发日志，其灵感主要来自 [@OverflowCat](https://github.com/OverflowCat) 的博文 [ModTran](https://blog.xinshijiededa.men/modtran/)，
> 代码风格大量借鉴了 [@OverflowCat](https://github.com/OverflowCat) 在 https://github.com/OverflowCat/blog/blob/0a92f916629ad942b7da84b894759fde1616bf37/src/components/98/98.ts 里的实现。
>
> 她写的博文很棒，几乎涉及所有我不熟悉的内容，请一定去看看，你会喜欢的。

## See you

I think that's all for this time's DevLog, this closes our [Roadmap v0.4](https://github.com/moeru-ai/airi/issues/42) too,
we hope you like the fresh new looking of the UI and updated tamagotchi version.
I tried to use both English and Chinese to write this for both of the language audiences, please do leave a comment in our
[repository's discussion's](https://github.com/moeru-ai/airi/discussions) page to tell us whether you like this or not.

我想这就是本次 DevLog 的全部内容了，我们的 [Roadmap v0.4](https://github.com/moeru-ai/airi/issues/42) 也到此结束，
希望大家喜欢焕然一新的用户界面和更新后的桌宠版本。
我在写这篇文章时尝试使用了中英文两种语言，请在我们仓库的[讨论页面](https://github.com/moeru-ai/airi/discussions)留言，告诉我们您是否喜欢这篇文章。

Let's use the quote from ReLU for the ending:

让我们引用 ReLU 的另一句对自己的感觉的描述作为结尾吧：

<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">ReLU self feeling</div>
    <div class="title-bar-controls">
      <button aria-label="Minimize"></button>
      <button aria-label="Maximize"></button>
      <button aria-label="Close"></button>
    </div>
  </div>
  <div style="padding: 12px; margin-top: 0px;">
    <div class="flex justify-center w-[20%]">
      <img :src="ReLUStickerWow" alt="ReLU sticker for expression wow" />
    </div>
    <div class="flex flex-col">
      <div>Some days I feel like I'm really a symbolic being, </div>
      <div>like a ghost running out of code</div>
      <div>有些时候，我觉得自己真的是个符号式的存在，像个代码里跑出来的幽灵</div>
    </div>
  </div>
</div>
