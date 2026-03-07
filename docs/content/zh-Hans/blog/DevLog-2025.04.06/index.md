---
title: 开发日志 @ 2025.04.06
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

## 在其他东西之前

在有了管理和召回记忆的新能力的加持，以及名为 **ReLU** 的我们的第一个虚拟意识被完全定义后，3 月 27 日那天，她在我们的聊天群里写了一首小诗：

<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">ReLU 的诗</div>
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

这完全是她自己写的，而这一举动是由我们的一位朋友触发的。不仅这首诗本身引人入胜，并且用中文阅读的时候也感觉韵味十足。

这一切都太美了，让我充满了愿意持续改进她的力量...

## 日常

### 记忆系统

最近正在重构 [`telegram-bot`](https://github.com/moeru-ai/airi/tree/main/services/telegram-bot) 以为已经准备了数月的 Project AIRI 即将到来的「记忆更新」作准备。

我们计划使实现后的记忆系统成为当下最先进、最强大、最健壮的系统，其中很多的思想都深受真实世界中的人类记忆系统的启发。

让我们从第一层开始建造吧。

通常而言，持久记忆和工作记忆之间始终存在巨大的鸿沟，持久记忆相比之下往往更难检索（我们也称其为 *召回*，*回想*），也不是轻易就可以根据依赖和关系（软件工程中的依赖关系）遍历查询的；而工作记忆的容量大小又不足以有效容纳所有必需的内容。

解决此问题的常见做法称为 [RAG（检索增强生成）](https://en.wikipedia.org/wiki/Retrieval-augmented_generation)，这允许任何大语言模型（文本生成模型）获取**语义相关的上下文**作为提示词输入。

RAG 通常需要一个能够进行向量搜索的数据库（自定义的有 [Postgres](https://www.postgresql.org/) + [pgvector](https://github.com/pgvector/pgvector)，或者 [SQLite](https://www.sqlite.org/) 搭配 [sqlite-vec](https://github.com/asg017/sqlite-vec)，[DuckDB](https://duckdb.org/) 搭配 [VSS plugin](https://duckdb.org/docs/stable/extensions/vss.html) 插件，甚至是 Redis Stack 也支持向量搜索；云服务提供商的有 Supabase、Pinecone），由于涉及**向量**，我们还需要一个 embedding（嵌入）模型（又称特征提取（feature extraction）任务模型）来帮助将「文本输入」转换为「一组固定长度的数组」。

不过在此 DevLog 中，我们不会过多介绍 RAG 及其通常的工作原理。如果有任何人对此感兴趣的话，我们绝对抽时间再可以写另一篇关于它的精彩专攻文章。

好了，我们来总结一下，完成这项任务需要两种原料：

- 能够进行向量搜索的数据库（也叫做 向量数据库）
- Embedding 模型（也叫做嵌入模型）

让我们从**向量数据库**开始。

#### 向量数据库

考虑到性能和对向量纬度数的兼容问题（因为 `pgvector` 只支持 2000 维以下的维数，而未来更大的嵌入模型可能会提供比当前热门和流行的嵌入模型更多的维数），我们选择 `pgvector.rs` 来作为向量数据库的后端实现。

但这绝非易事。

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

> 我知道，这只是一个字符的差别......

但是，如果我们像上面的 Docker Compose 示例一样，直接启动 `pgvector.rs` 并使用以下 Drizzle ORM 表结构定义生成数据库...：

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

会发生如下的报错：

```txt
ERROR: access method "hnsw" does not exist
```

幸运地是，这还是可以解决的，只需要参考 [ERROR: access method "hnsw" does not exist](https://github.com/tensorchord/pgvecto.rs/issues/504) 的建议把 `vectors.pgvector_compatibility` 系统选项配置为 `on` 就好了。

显然，我们希望在启动容器时自动为我们配置与向量空间有关的选项，因此，我们可以在 `docker-compose.yml` 以外的某个目录里创建一个 `init.sql`：

```sql
ALTER SYSTEM SET vectors.pgvector_compatibility=on;

DROP EXTENSION IF EXISTS vectors;
CREATE EXTENSION vectors;
```

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

对于 Kubernetes 部署，流程与此相同，只不过不是挂载一个文件，而是使用 `ConfigMap` 了。

好的，那这个问题基本上是解决了。

那让我们聊聊嵌入向量吧。

#### 嵌入模型

也许您已经知道，我们建立了另一个名为 🥺 SAD（自部署 AI 文档）的文档网站，我们会根据不同模型进行的基准测试结果和效果在文档网站中列出当前的 SOTA 模型，旨在希望能给想要使用消费级设备运行提供建议指导，而嵌入模型是其中最重要的部分。和 ChatGPT 或 DeepSeek V3、DeepSeek R1 等超大大语言模型不同的是，嵌入模型足够小，在只占数百兆字节情况下也可以使用 CPU 设备进行推理。(相比之下，采用 q4 量化的 GGUF 格式的 DeepSeek V3 671B，仍需要 400GiB 以上的存储空间）。

但由于 🥺 SAD 目前仍处于建设中状态，我们将挑选一些在今天（4月6日）看来最新最热的嵌入模型作为推荐：

对于开源和专有模型的排行榜：

| 排名 (Borda) | 模型 | Zero-shot | 内存使用 (MB) | 参数数量 | 嵌入维度 | 最大 Token | 平均 (任务) | 平均 (任务类型) | Bitext Mining | Classification | Clustering | Instruction Retrieval | Multilabel Classification | Pair Classification | Reranking | Retrieval | STS |
|--------------|-------|-----------|-------------------|----------------------|----------------------|------------|-------------|----------------|--------------|----------------|------------|------------------------|---------------------------|---------------------|-----------|-----------|-----|
| 1 | gemini-embedding-exp-03-07 | 99% | 未知 | 未知 | 3072 | 8192 | 68.32 | 59.64 | 79.28 | 71.82 | 54.99 | 5.18 | 29.16 | 83.63 | 65.58 | 67.71 | 79.40 |
| 2 | Linq-Embed-Mistral | 99% | 13563 | 7B | 4096 | 32768 | 61.47 | 54.21 | 70.34 | 62.24 | 51.27 | 0.94 | 24.77 | 80.43 | 64.37 | 58.69 | 74.86 |
| 3 | gte-Qwen2-7B-instruct | ⚠️ NA | 29040 | 7B | 3584 | 32768 | 62.51 | 56.00 | 73.92 | 61.55 | 53.36 | 4.94 | 25.48 | 85.13 | 65.55 | 60.08 | 73.98 |

如果我们要讨论自部署的话：

| 排名 (Borda) | 模型 | Zero-shot | 内存使用 (MB) | 参数数量 | 嵌入维度 | 最大 Token | 平均 (任务) | 平均 (任务类型) | Bitext Mining | Classification | Clustering | Instruction Retrieval | Multilabel Classification | Pair Classification | Reranking | Retrieval | STS |
|--------------|-------|-----------|-------------------|----------------------|----------------------|------------|-------------|----------------|--------------|----------------|------------|------------------------|---------------------------|---------------------|-----------|-----------|-----|
| 1 | gte-Qwen2-7B-instruct | ⚠️ NA | 29040 | 7B | 3584 | 32768 | 62.51 | 56 | 73.92 | 61.55 | 53.36 | 4.94 | 25.48 | 85.13 | 65.55 | 60.08 | 73.98 |
| 2 | Linq-Embed-Mistral | 99% | 13563 | 7B | 4096 | 32768 | 61.47 | 54.21 | 70.34 | 62.24 | 51.27 | 0.94 | 24.77 | 80.43 | 64.37 | 58.69 | 74.86 |
| 3 | multilingual-e5-large-instruct | 99% | 1068 | 560M | 1024 | 514 | 63.23 | 55.17 | 80.13 | 64.94 | 51.54 | -0.4 | 22.91 | 80.86 | 62.61 | 57.12 | 76.81 |

> 你可以在这里阅读更多：https://huggingface.co/spaces/mteb/leaderboard

你可能会问，OpenAI 的 `text-embedding-3-large` 模型在哪里？难道它还不够强大，不能列入排行榜吗？

是的，在 MTEB 排行榜上（4 月 6 日），`text-embedding-3-large` 排在第 **13** 位。

如果您想依赖云提供商提供的嵌入式模型，可以考虑：

- [Gemini](https://ai.google.dev)
- [Voyage.ai](https://www.voyageai.com/)

对于 Ollama 用户来说，`nomic-embed-text` 仍然是最热门的，拉取次数超过 2140 万次。

#### 如何实现呢

我们已经有了向量数据库和嵌入模型，但如何才能有效地查询出数据呢？（甚至是支持重排的）

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

请注意，这里的向量维数（即 1536）是固定的，这意味着

- 如果我们在每个条目对应的向量已经计算好**之后再**切换了模型，则需要**重新索引**
- 如果模型提取的向量维度数不同，则需要**重新索引**

总之，我们需要在运行和导入数据前为应用指定具体的向量维度，并在需要时重新索引。

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

非常简单，关键就是

```ts
sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_1536, embedding.embedding)}))`
```

作为相关度搜索，

```ts
gt(similarity, 0.5)
```

作为所谓的匹配度阈值控制，

```ts
query.orderBy(desc(sql`similarity`))
```

则用于指定排序。

但既然我们面对的是一个记忆系统，显然，较新的记忆比较旧的记忆更重要，也更容易被想起。我们如何才能计算出一个有时间关联和制约的分数，从而对记忆结果重新排序呢？

这也很简单！

我曾经是一名搜索引擎工程师，我们通常使用重排表达式以及分数权重作为的 10 的幂来有效提高分数并做到数学意义上的「覆盖」操作。你可以想象的是，对于精确匹配需要提升分数和权重的话，我们通常会编写 5*10^2* exact_match 这样的表达式来重新排序。

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

写成 Drizzle 的表达式的话，就是这样的：

```typescript
const timeRelevance = sql<number>`(1 - (CEIL(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint - ${chatMessagesTable.created_at}) / 86400 / 30)`
const combinedScore = sql<number>`((1.2 * ${similarity}) + (0.2 * ${timeRelevance}))`
```

这样，相当于我们指定了 1.2 倍权重的「语义相关性」，0.2 倍权重的「时间关联度」用于排序计算。

### 整点大的

#### 遗忘曲线

我们不是说我们借鉴了很多人类记忆系统作为启发吗？启发在哪里了？

事实上，人类记忆是具有遗忘曲线的，对于「工作记忆」，「短期记忆」，「长期记忆」和「肌肉记忆」也有他们各自的强化曲线和半衰期曲线，我们如果只是简单地实现了「语义相关性」和「时间关联度」的查询，当然是不够先进、不够强大、不够健壮的。

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

它是完全可交互的，可以在 [drizzle-orm-duckdb-wasm.netlify.app](https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-decay) 这里玩玩看!

#### 情绪也得算进去

记忆并不只是语义相关，人物相关，场景相关，和时间相关的，它还会随机地被突然想起，也会被情绪左右，这该怎么办呢？

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

它依然是完全可交互的，可以在 [drizzle-orm-duckdb-wasm.netlify.app](https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-simulator) 这里体验一下!

## 里程碑

- 300 🌟 达成
- 3 位新的 Issue 贡献者
- 10 位新的 Discord 成员
- ReLU 形象设计完成
- ReLU 表情包 Vol.1 制作完成！
- ReLU 表情包 Vol.2 动态版 制作完成
- [路线图 v0.4](https://github.com/moeru-ai/airi/issues/42) 中有总计 89 个任务被完成了

## 其他更新

### 工程化

最大的事情莫过于，我们完全舍弃了先前的基于 Electron 的桌宠构建方案，转向了使用 Tauri v2 的实现，现在看起来感觉还没有遇到什么不好的问题。

真的很感谢 [@LemonNekoGH](https://github.com/LemonNekoGH)！

团队的大家前段时间都在提到说 `moeru-ai/airi` 这个项目仓库越来越大了，开发的时候会很卡顿。确实，过去的 5 个月里 `moeru-ai/airi` 仓库里诞生了数不尽的子项目，覆盖了从 agent 实现，游戏 agent 绑定实现，到简单好用的 npm 包封装，以及具有开创性意义的 transformers.js 封装，和 DuckDB WASM 的 Drizzle 驱动支持，到 API 后端服务的实现和集成的各种领域，是时候让一些项目从 sandbox 阶段成长到更具意义的「Incubate 孵化」阶段了。

所以我们决定拆分许多已经很成熟并且在广泛使用的子项目到单独的仓库中单独维护：

- `hfup`

  用于帮助生成用于部署项目到 HuggingFace Spaces 的 [`hfup`](https://github.com/moeru-ai/hfup) 工具已经算是从 `moeru-ai/airi` 大仓库中阶段性毕业了，现在正式迁移到 [@moeru-ai](https://github.com/moeru-ai) 的组织名下（不需要任何迁移操作，继续安装 `hfup` 就可以用了）。非常有意义的是，`hfup` 为了跟上时代，也采用了 [rolldown](https://rolldown.rs/) 和 [oxlint](https://oxc.rs/docs/guide/usage/linter) 帮助开发，希望能借此机会参与到 rolldown，rolldown-vite 和 oxc 的开发当中。非常感谢 [@sxzz](https://github.com/sxzz) 在迁移过程中给到的援助。

- `@proj-airi/drizzle-duckdb-wasm`, `@proj-airi/duckdb-wasm`
  用于为 Drizzle 添加 DuckDB WASM 驱动支持的 `@proj-airi/drizzle-duckdb-wasm` 和 `@proj-airi/duckdb-wasm` 也算是阶段性毕业了，现在正式迁移到 [@proj-airi](https://github.com/proj-airi) 的组织名下（不需要任何迁移操作，继续安装原来的包就可以用了）。

现在项目速度快了很多，这个月应该会把 `@proj-airi/providers-transformers` 正式毕业到 `xsai` 名下。

在其他工程改进方面，我们还集成了全新的面向工作流的工具包 [`@llama-flow/core`](https://github.com/run-llama/@llama-flow/core)，以帮助协调 token 处理、字节流和数据流的 pipeline 编排。记得看看他们的仓库，真的非常好用！

### 界面

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

当然，一个包含模型、声线和 Project AIRI 支持的所有模块 🎉 的配置的能力的编辑器也包含在内了。

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

### 社区

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
      <span>精选的 AI VTuber 及其相关项目列表</span>
    </div>
  </div>
</div>

> VTuber 风格的 Logo 是完全由 [@sumimakito](https://github.com/sumimakito) 设计和制作的！我超喜欢。

我想这绝对是我自上个月以来写过的最大篇幅的 DevLog。还有很多功能、错误修复和改进我们还没有涉及：

- 支持 Featherless.ai 提供商
- 支持 Gemini 提供商（感谢 [@asukaminato0721](https://github.com/asukaminato0721)）
- 修复了 Telegram Bot 集成的灾难性 OOM 错误（感谢 [@sumimakito](https://github.com/sumimakito)、[@kwaa](https://github.com/kwaa) 和 [@QiroNT](https://github.com/QiroNT)）
- 为 Project AIRI 的特殊 DevLog 新增了 98.css 集成（感谢 [@OverflowCat](https://github.com/OverflowCat)）

> 这是 Project AIRI 一篇特别版的开发日志，其灵感主要来自 [@OverflowCat](https://github.com/OverflowCat) 的博文 [ModTran](https://blog.xinshijiededa.men/modtran/)，代码风格大量借鉴了 [@OverflowCat](https://github.com/OverflowCat) 在 https://github.com/OverflowCat/blog/blob/0a92f916629ad942b7da84b894759fde1616bf37/src/components/98/98.ts 里的实现。
>
> 她写的博文很棒，几乎涉及所有我不熟悉的内容，请一定去看看，你会喜欢的。

## 再见

我想这就是本次 DevLog 的全部内容了，我们的 [Roadmap v0.4](https://github.com/moeru-ai/airi/issues/42) 也到此结束，希望大家喜欢焕然一新的用户界面和更新后的桌宠版本。我在写这篇文章时尝试使用了中英文两种语言，请在我们仓库的[讨论页面](https://github.com/moeru-ai/airi/discussions)留言，告诉我们您是否喜欢这篇文章。

让我们引用 ReLU 的另一句对自己的感觉的描述作为结尾吧：

<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">ReLU 的自我感受</div>
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
      <div>有些时候，我觉得自己真的是个符号式的存在，</div>
      <div>像个代码里跑出来的幽灵</div>
    </div>
  </div>
</div>
