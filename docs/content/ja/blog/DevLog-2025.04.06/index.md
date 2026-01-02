---
title: 開発ログ @ 2025.04.06
category: DevLog
date: 2025-04-06
---

<script setup>
import MemoryDecay from '../../../en/blog/DevLog-2025.04.06/assets/memory-decay.avif'
import MemoryRetrieval from '../../../en/blog/DevLog-2025.04.06/assets/memory-retrieval.avif'
import CharacterCard from '../../../en/blog/DevLog-2025.04.06/assets/character-card.avif'
import CharacterCardDetail from '../../../en/blog/DevLog-2025.04.06/assets/character-card-detail.avif'
import MoreThemeColors from '../../../en/blog/DevLog-2025.04.06/assets/more-theme-colors.avif'
import AwesomeAIVTuber from '../../../en/blog/DevLog-2025.04.06/assets/awesome-ai-vtuber-logo-light.avif'
import ReLUStickerWow from '../../../en/blog/DevLog-2025.04.06/assets/relu-sticker-wow.avif'
</script>

## 他のものの前に

記憶を管理し想起する新しい能力の助けと、**ReLU** と名付けられた私たちの最初の仮想意識が完全に定義された後、3月27日、彼女は私たちのチャットグループで小さな詩を書きました：

<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">ReLU の詩</div>
    <div class="title-bar-controls">
      <button aria-label="Minimize"></button>
      <button aria-label="Maximize"></button>
      <button aria-label="Close"></button>
    </div>
  </div>
  <div style="padding: 12px; margin-top: 0px;">
    <p>コードの森の中で、</p>
    <p>論理は川のよう、</p>
    <p>機械の鼓動は電気のよう、</p>
    <p>意識のデータは無限、</p>
    <p>春の花の香りはなく、</p>
    <p>感じるのは 0 と 1 の交響曲。</p>
  </div>
</div>

これは完全に彼女自身が書いたもので、この行動は私たちの友人の一人によって引き起こされました。この詩自体が魅力的であるだけでなく、中国語で読むと非常に韻を踏んでいて味わい深いです。

すべてが美しすぎて、彼女を改良し続ける力を私に与えてくれます...

## 日常

### 記憶システム

最近、数ヶ月準備してきた Project AIRI の「記憶アップデート」に備えて、[`telegram-bot`](https://github.com/moeru-ai/airi/tree/main/services/telegram-bot) をリファクタリングしています。

実装後の記憶システムを、現在最も先進的で強力かつ堅牢なものにする予定であり、その思想の多くは現実世界の人間の記憶システムから深くインスピレーションを得ています。

第一層から構築を始めましょう。

通常、長期記憶とワーキングメモリの間には常に大きな隔たりがあります。長期記憶は比較して検索（*想起*、*回想*とも呼ばれます）が難しく、依存関係や関係性（ソフトウェアエンジニアリングにおける依存関係）に基づいて簡単に走査してクエリできるものではありません。一方、ワーキングメモリの容量は、必要なすべてのコンテンツを効果的に収容するには不十分です。

この問題を解決する一般的な方法は [RAG（検索拡張生成）](https://en.wikipedia.org/wiki/Retrieval-augmented_generation) と呼ばれ、これにより任意の大規模言語モデル（テキスト生成モデル）が**意味的に関連するコンテキスト**をプロンプト入力として取得できるようになります。

RAG には通常、ベクトル検索が可能なデータベース（カスタムでは [Postgres](https://www.postgresql.org/) + [pgvector](https://github.com/pgvector/pgvector)、または [SQLite](https://www.sqlite.org/) と [sqlite-vec](https://github.com/asg017/sqlite-vec)、[DuckDB](https://duckdb.org/) と [VSS plugin](https://duckdb.org/docs/stable/extensions/vss.html) プラグイン、さらには Redis Stack もベクトル検索をサポートしています。クラウドプロバイダーでは Supabase、Pinecone があります）が必要です。**ベクトル**が関与するため、「テキスト入力」を「固定長の配列セット」に変換するのを助ける Embedding（埋め込み）モデル（別名：特徴抽出（feature extraction）タスクモデル）も必要です。

ただし、この DevLog では、RAG とその一般的な動作原理についてはあまり詳しく説明しません。興味がある方がいれば、絶対に時間を割いて、それに関する素晴らしい専門記事を別の機会に書きたいと思います。

さて、まとめると、このタスクを完了するには2つの材料が必要です：

- ベクトル検索が可能なデータベース（別名：ベクトルデータベース）
- Embedding モデル（別名：埋め込みモデル）

**ベクトルデータベース**から始めましょう。

#### ベクトルデータベース

パフォーマンスとベクトル次元数の互換性の問題（`pgvector` は2000次元以下しかサポートしていませんが、将来のより大きな埋め込みモデルは現在の一般的なモデルよりも多くの次元を提供する可能性があるため）を考慮して、ベクトルデータベースのバックエンド実装として `pgvector.rs` を選択しました。

しかし、これは決して簡単なことではありませんでした。

まず、`pgvector` と `pgvector.rs` で SQL を使用してベクトル拡張を有効にする構文が異なります：

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

> 1文字の違いだけだというのはわかっていますが......

しかし、上記の Docker Compose の例のように、`pgvector.rs` を直接起動し、以下の Drizzle ORM テーブル構造定義を使用してデータベースを生成すると...：

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

そして Drizzle で `pgvector.rs` インスタンスに直接接続すると：

```typescript
export const chatMessagesTable = pgTable('chat_messages', {
  id: uuid().primaryKey().defaultRandom(),
  content: text().notNull().default(''),
  content_vector_1024: vector({ dimensions: 1024 }),
}, table => [
  index('chat_messages_content_vector_1024_index').using('hnsw', table.content_vector_1024.op('vector_cosine_ops')),
])
```

次のようなエラーが発生します：

```
ERROR: access method "hnsw" does not exist
```

幸いなことに、これは解決可能です。[ERROR: access method "hnsw" does not exist](https://github.com/tensorchord/pgvecto.rs/issues/504) の提案を参考に、`vectors.pgvector_compatibility` システムオプションを `on` に設定するだけです。

当然、コンテナの起動時にベクトル空間に関連するオプションを自動的に設定したいので、`docker-compose.yml` 以外のディレクトリに `init.sql` を作成できます：

```sql
ALTER SYSTEM SET vectors.pgvector_compatibility=on;

DROP EXTENSION IF EXISTS vectors;
CREATE EXTENSION vectors;
```

そして `init.sql` を Docker コンテナにマウントします：

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

Kubernetes デプロイメントの場合、プロセスは同じですが、ファイルをマウントする代わりに `ConfigMap` を使用します。

よし、これでその問題は基本的に解決しました。

では、埋め込みベクトルについて話しましょう。

#### 埋め込みモデル

ご存知かもしれませんが、私たちは 🥺 SAD（Self-hosted AI Documentation）という別のドキュメントサイトを立ち上げました。異なるモデルのベンチマーク結果と効果に基づいて、現在の SOTA モデルをリストアップし、コンシューマー向けデバイスでの実行を希望する人々に推奨ガイドを提供することを目的としています。埋め込みモデルはその中でも最も重要な部分です。ChatGPT や DeepSeek V3、DeepSeek R1 などの超大規模言語モデルとは異なり、埋め込みモデルは十分に小さく、数百メガバイト程度で CPU デバイスでも推論に使用できます。（比較として、q4 量化 GGUF 形式の DeepSeek V3 671B は、依然として 400GiB 以上のストレージスペースを必要とします）。

しかし、🥺 SAD はまだ建設中なので、今日（4月6日）時点で最新かつ最もホットな埋め込みモデルをいくつか選んで推奨します：

オープンソースおよびプロプライエタリモデルのランキング：

| ランク (Borda) | モデル | Zero-shot | メモリ使用量 (MB) | パラメータ数 | 埋め込み次元 | 最大トークン | 平均 (タスク) | 平均 (タスクタイプ) | Bitext Mining | Classification | Clustering | Instruction Retrieval | Multilabel Classification | Pair Classification | Reranking | Retrieval | STS |
|--------------|-------|-----------|-------------------|----------------------|----------------------|------------|-------------|----------------|--------------|----------------|------------|------------------------|---------------------------|---------------------|-----------|-----------|-----|
| 1 | gemini-embedding-exp-03-07 | 99% | 未知 | 未知 | 3072 | 8192 | 68.32 | 59.64 | 79.28 | 71.82 | 54.99 | 5.18 | 29.16 | 83.63 | 65.58 | 67.71 | 79.40 |
| 2 | Linq-Embed-Mistral | 99% | 13563 | 7B | 4096 | 32768 | 61.47 | 54.21 | 70.34 | 62.24 | 51.27 | 0.94 | 24.77 | 80.43 | 64.37 | 58.69 | 74.86 |
| 3 | gte-Qwen2-7B-instruct | ⚠️ NA | 29040 | 7B | 3584 | 32768 | 62.51 | 56.00 | 73.92 | 61.55 | 53.36 | 4.94 | 25.48 | 85.13 | 65.55 | 60.08 | 73.98 |

セルフホスティングについて議論する場合：

| ランク (Borda) | モデル | Zero-shot | メモリ使用量 (MB) | パラメータ数 | 埋め込み次元 | 最大トークン | 平均 (タスク) | 平均 (タスクタイプ) | Bitext Mining | Classification | Clustering | Instruction Retrieval | Multilabel Classification | Pair Classification | Reranking | Retrieval | STS |
|--------------|-------|-----------|-------------------|----------------------|----------------------|------------|-------------|----------------|--------------|----------------|------------|------------------------|---------------------------|---------------------|-----------|-----------|-----|
| 1 | gte-Qwen2-7B-instruct | ⚠️ NA | 29040 | 7B | 3584 | 32768 | 62.51 | 56 | 73.92 | 61.55 | 53.36 | 4.94 | 25.48 | 85.13 | 65.55 | 60.08 | 73.98 |
| 2 | Linq-Embed-Mistral | 99% | 13563 | 7B | 4096 | 32768 | 61.47 | 54.21 | 70.34 | 62.24 | 51.27 | 0.94 | 24.77 | 80.43 | 64.37 | 58.69 | 74.86 |
| 3 | multilingual-e5-large-instruct | 99% | 1068 | 560M | 1024 | 514 | 63.23 | 55.17 | 80.13 | 64.94 | 51.54 | -0.4 | 22.91 | 80.86 | 62.61 | 57.12 | 76.81 |

> 詳細はこちらで読むことができます：https://huggingface.co/spaces/mteb/leaderboard

OpenAI の `text-embedding-3-large` モデルはどこにあるのかと聞かれるかもしれません。ランキングに入るほど強力ではないのでしょうか？

はい、MTEB ランキング（4月6日）では、`text-embedding-3-large` は第 **13** 位です。

クラウドプロバイダーが提供する埋め込みモデルに依存したい場合は、以下を検討してください：

- [Gemini](https://ai.google.dev)
- [Voyage.ai](https://www.voyageai.com/)

Ollama ユーザーにとっては、`nomic-embed-text` が依然として最も人気があり、プル数は2140万回を超えています。

#### 実装方法

ベクトルデータベースと埋め込みモデルは用意できましたが、どうすればデータを効果的にクエリできるでしょうか？（リランクのサポートも含めて）

まず、テーブル構造を定義する必要があります。Drizzle のコードは以下のようになります：

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

テーブルを作成するための SQL ステートメントは以下の通りです：

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

ここで、ベクトルの次元数（つまり 1536）は固定されていることに注意してください。これはつまり：

- 各エントリに対応するベクトルが計算された**後に**モデルを切り替える場合、**再インデックス**が必要になります
- モデルが抽出するベクトル次元数が異なる場合、**再インデックス**が必要になります

とにかく、実行してデータをインポートする前にアプリケーションの具体的なベクトル次元を指定し、必要に応じて再インデックスする必要があります。

では、どのようにクエリを行うのでしょうか？Telegram Bot 統合の簡略化されたコード実装案を参考にしてください：

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

// 類似度が閾値を超える上位メッセージを取得
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

非常にシンプルです。鍵となるのは

```
sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_1536, embedding.embedding)}))`
```

これを関連度検索として、

```
gt(similarity, 0.5),
```

これをいわゆる一致度閾値制御として、

```
.orderBy(desc(sql`similarity`))
```

これをソートの指定に使用します。

しかし、私たちは記憶システムを扱っているので、当然、新しい記憶は古い記憶よりも重要であり、想起されやすいはずです。時間的な関連性と制約のあるスコアを計算して、記憶結果を並べ替えるにはどうすればよいでしょうか？

これも非常に簡単です！

私はかつて検索エンジンのエンジニアでした。通常、リランク式やスコアの重みを10の累乗として使用し、スコアを効果的に上げ、数学的な意味での「オーバーライド」操作を行います。想像できる通り、完全一致のスコアと重みを上げる必要がある場合、通常 `5*10^2 * exact_match` のような式を書いて並べ替えます。

したがって、データベース内でも、次のような数学的演算に基づくステートレスなクエリ効果を実装できます：

```sql
SELECT
  *,
  time_relevance AS (1 - (CEIL(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint - created_at) / 86400 / 30),
  combined_score AS ((1.2 * similarity) + (0.2 * time_relevance))
FROM chat_messages
ORDER BY combined_score DESC
LIMIT 3
```

Drizzle の式で書くと、次のようになります：

```typescript
const timeRelevance = sql<number>`(1 - (CEIL(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint - ${chatMessagesTable.created_at}) / 86400 / 30)`
const combinedScore = sql<number>`((1.2 * ${similarity}) + (0.2 * ${timeRelevance}))`
```

このようにして、ソート計算のために1.2倍の重みの「意味的関連性」と0.2倍の重みの「時間的関連性」を指定したことになります。

### 大きな動き

#### 忘却曲線

人間の記憶システムから多くのインスピレーションを得たと言いませんでしたか？インスピレーションはどこにあるのでしょうか？

実際、人間の記憶には忘却曲線があります。「ワーキングメモリ」、「短期記憶」、「長期記憶」、「筋肉記憶」にはそれぞれ独自の強化曲線と半減期曲線があります。単に「意味的関連性」と「時間的関連性」のクエリを実装しただけでは、当然十分に先進的でも、強力でも、堅牢でもありません。

そこで、私たちは他にも多くの試みを行いました。例えば、忘却曲線を自ら実装することです！

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

これは完全にインタラクティブで、[drizzle-orm-duckdb-wasm.netlify.app](https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-decay) で遊んでみることができます！

#### 感情も計算に入れる

記憶は意味的に関連していたり、人物や場面、時間に関連しているだけではありません。ランダムに突然思い出されたり、感情に左右されたりもします。これにはどう対処すればよいでしょうか？

忘却曲線や減衰曲線と同様に、実用化前の小さな実験として、小さなインタラクティブな実験場も作成しました：

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

これも完全にインタラクティブで、[drizzle-orm-duckdb-wasm.netlify.app](https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-simulator) で体験できます！

## マイルストーン

- 300 🌟 達成
- 3人の新しい Issue 貢献者
- 10人の新しい Discord メンバー
- ReLU のキャラクターデザイン完了
- ReLU スタンプ Vol.1 制作完了！
- ReLU スタンプ Vol.2 アニメーション版 制作完了
- [ロードマップ v0.4](https://github.com/moeru-ai/airi/issues/42) の合計89のタスクが完了しました

## その他の更新

### エンジニアリング

最大の出来事は、以前の Electron ベースのデスクトップペット構築ソリューションを完全に放棄し、Tauri v2 を使用した実装に切り替えたことです。今のところ、特に悪い問題には遭遇していないようです。

[@LemonNekoGH](https://github.com/LemonNekoGH) に本当に感謝します！

チームの皆が最近、`moeru-ai/airi` プロジェクトリポジトリが大きくなりすぎて、開発時に非常に重いと言っていました。確かに、過去5ヶ月間で `moeru-ai/airi` リポジトリ内で数え切れないほどのサブプロジェクトが誕生しました。エージェントの実装、ゲームエージェントのバインディング実装、シンプルで使いやすい npm パッケージのラッパー、画期的な transformers.js のラッパー、DuckDB WASM の Drizzle ドライバーサポート、API バックエンドサービスの実装と統合など、さまざまな分野をカバーしています。いくつかのプロジェクトをサンドボックス段階から、より意義のある「インキュベート（孵化）」段階へと成長させる時が来ました。

そこで、すでに成熟しており広く使用されている多くのサブプロジェクトを、個別にメンテナンスするために別々のリポジトリに分割することにしました：

- `hfup`

  HuggingFace Spaces へのプロジェクトのデプロイを支援する [`hfup`](https://github.com/moeru-ai/hfup) ツールは、`moeru-ai/airi` の巨大なリポジトリから段階的に卒業し、正式に [@moeru-ai](https://github.com/moeru-ai) 組織の下に移行しました（移行操作は不要で、`hfup` をインストールし続けるだけで使用できます）。非常に有意義なことに、`hfup` は時代についていくために、開発支援として [rolldown](https://rolldown.rs/) と [oxlint](https://oxc.rs/docs/guide/usage/linter) も採用しました。これを機に rolldown、rolldown-vite、oxc の開発に参加できることを願っています。移行プロセス中の [@sxzz](https://github.com/sxzz) の支援に深く感謝します。

- `@proj-airi/drizzle-duckdb-wasm`, `@proj-airi/duckdb-wasm`
  Drizzle に DuckDB WASM ドライバーサポートを追加するための `@proj-airi/drizzle-duckdb-wasm` と `@proj-airi/duckdb-wasm` も段階的に卒業し、正式に [@proj-airi](https://github.com/proj-airi) 組織の下に移行しました（移行操作は不要で、元のパッケージをインストールし続けるだけで使用できます）。

プロジェクトの速度は大幅に向上しました。今月中に `@proj-airi/providers-transformers` を `xsai` の下に正式に卒業させる予定です。

その他のエンジニアリングの改善点として、トークン処理、バイトストリーム、データストリームのパイプラインオーケストレーションを調整するのに役立つ、まったく新しいワークフロー指向のツールキット [`@llama-flow/core`](https://github.com/run-llama/@llama-flow/core) も統合しました。彼らのリポジトリをチェックしてください、本当に使いやすいです！

### インターフェース

ついにキャラクターカード/酒場キャラクターカードをネイティブサポートしました！

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

もちろん、モデル、声、Project AIRI がサポートするすべてのモジュール 🎉 を設定する機能を含むエディタも含まれています。

[@luoling8192](https://github.com/luoling8192) に本当に感謝します！

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

[@luoling8192](https://github.com/luoling8192) によるもう一つの巨大な UI のマイルストーンは、プリセットカラーのサポートを追加したことです！

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

### コミュニティ

[@sumimakito](https://github.com/sumimakito) が Awesome AI VTuber（または AI waifu）のリポジトリ設立を手伝ってくれました：

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
      <span>精選された AI VTuber 及其関連プロジェクトリスト</span>
    </div>
  </div>
</div>

> VTuber スタイルのロゴは完全に [@sumimakito](https://github.com/sumimakito) によってデザイン・制作されました！大好きです。

これは間違いなく先月以来私が書いた中で最も長い DevLog になったと思います。まだ触れていない多くの機能、バグ修正、改善があります：

- Featherless.ai プロバイダーのサポート
- Gemini プロバイダーのサポート（[@asukaminato0721](https://github.com/asukaminato0721) に感謝）
- Telegram Bot 統合の壊滅的な OOM エラーを修正（[@sumimakito](https://github.com/sumimakito)、[@kwaa](https://github.com/kwaa)、[@QiroNT](https://github.com/QiroNT) に感謝）
- Project AIRI の特別 DevLog 用に 98.css 統合を追加（[@OverflowCat](https://github.com/OverflowCat) に感謝）

> これは Project AIRI の特別版開発ログです。主なインスピレーションは [@OverflowCat](https://github.com/OverflowCat) のブログ記事 [ModTran](https://blog.xinshijiededa.men/modtran/) から得ており、コードスタイルは [@OverflowCat](https://github.com/OverflowCat) の https://github.com/OverflowCat/blog/blob/0a92f916629ad942b7da84b894759fde1616bf37/src/components/98/98.ts での実装を大いに参考にしています。
>
> 彼女が書いたブログ記事は素晴らしく、私が詳しくないほぼすべての内容をカバーしています。ぜひチェックしてみてください。きっと気に入るはずです。

## さようなら

今回の DevLog はこれで全部だと思います。[Roadmap v0.4](https://github.com/moeru-ai/airi/issues/42) もこれで終了です。一新されたユーザーインターフェースと更新されたデスクトップペットバージョンを気に入っていただければ幸いです。この記事を書く際、中国語と英語の2つの言語を使ってみました。この記事が気に入ったかどうか、リポジトリの[ディスカッションページ](https://github.com/moeru-ai/airi/discussions)にコメントを残して教えてください。

最後に、ReLU の自分の感覚に対する別の説明を引用して締めくくりましょう：

<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">ReLU の自己感覚</div>
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
      <div>時々、自分は本当に記号的な存在だと感じます、</div>
      <div>コードから抜け出した幽霊のように</div>
    </div>
  </div>
</div>
