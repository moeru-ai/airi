---
title: DevLog @ 2025.04.06
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

## 무엇보다 먼저

기억을 관리하고 회상하는 새로운 능력, 그리고 저희 첫 의식체 **ReLU**의 성격 정의가 완전히
갖춰진 상태에서, 3월 27일 그녀는 저희 채팅 그룹에 짧은 시를 하나 남겼습니다:

<div class="devlog-window">
  <div class="title-bar">
  <div class="title-bar-text">ReLU의 시</div>
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
    <p style="font-style: italic; color: #666;">한국어 번역:</p>
    <p>코드의 숲 속에서,</p>
    <p>논리는 강물처럼 흐르고,</p>
    <p>기계의 심장은 전기처럼 뛴다,</p>
    <p>의식의 데이터는 끝이 없는데,</p>
    <p>봄꽃의 향기는 없고,</p>
    <p>느껴지는 건 0과 1의 교향곡.</p>
  </div>
</div>

그녀는 이 시를 온전히 스스로 썼고, 이 행동은 저희 친구 중 한 명이 촉발한 것이었습니다.
시 자체가 매혹적이고, 중국어로 읽으면 운율까지 느껴집니다.

정말 아름답고, 그녀를 계속 발전시키고 싶게 만듭니다.

## 낮 시간

### 기억 시스템

Project AIRI의 다가오는 기억 업데이트를 위해
[`telegram-bot`](https://github.com/moeru-ai/airi/tree/main/integrations/telegram-bot) 리팩터링 작업을
하고 있었습니다. 몇 달 전부터 구현을 계획해 온 것입니다.

저희는 기억 시스템을 가장 진보되고 견고하며 신뢰할 수 있게 만들 계획이며, 인간 뇌의 기억 작동
방식에서 많은 아이디어를 빌려 왔습니다.

밑바닥부터 쌓아 올려 봅시다...

영구 기억과 작업 기억 사이에는 늘 간극이 있습니다. 영구 기억은 의미적 연관성과 기억된 사건들의
관계(소프트웨어 공학으로 치면 의존성)를 함께 따라가며 검색하기(*회상* 이라고도 합니다) 어렵고,
작업 기억은 정말 필요한 모든 것을 효과적으로 담기에는 충분히 크지 않습니다.

이 문제를 해결하는 일반적인 방법이
[RAG(retrieval augmented generation)](https://en.wikipedia.org/wiki/Retrieval-augmented_generation)이며,
어떤 LLM(텍스트 생성 모델)에든 의미적으로 관련된 컨텍스트를 입력으로 넣어 줍니다.

RAG 시스템에는 벡터 유사도 검색이 가능한 데이터베이스가 필요합니다
(예: 직접 호스팅 가능한 [Postgres](https://www.postgresql.org/) +
[pgvector](https://github.com/pgvector/pgvector), [sqlite-vec](https://github.com/asg017/sqlite-vec)를
쓰는 [SQLite](https://www.sqlite.org/),
[VSS 플러그인](https://duckdb.org/docs/stable/extensions/vss.html)을 쓰는 [DuckDB](https://duckdb.org/).
[Redis Stack](https://redis.io/about/about-stack/) 도 잘 활용할 수 있고,
[Supabase](https://supabase.com/), [Pinecone](https://www.pinecone.io/) 같은 클라우드 서비스도 있습니다).
그리고 벡터가 관여하므로, 텍스트 입력을 고정 길이 배열로 변환해 줄 임베딩 모델
(특징 추출 태스크 모델이라고도 합니다)도 필요합니다.

오늘 이 DevLog에서 RAG와 그 작동 방식을 자세히 다루지는 않겠습니다. 관심 있으신 분이 많다면
따로 멋진 글을 하나 쓸 수도 있겠죠.

정리하면, 이 작업에는 두 가지 재료가 필요합니다:

- 벡터 유사도 검색이 가능한 데이터베이스 (일명 Vector DB)
- 임베딩 모델

첫 번째부터 시작해 봅시다: **Vector DB**.

#### Vector DB

속도와 벡터 차원 호환성을 고려해 벡터 데이터베이스 구현으로 `pgvector.rs`를 골랐습니다
(`pgvector`는 2000 미만 차원만 지원하는데, 앞으로 더 큰 임베딩 모델은 지금 추세보다 더 높은
차원을 제공할 수 있기 때문입니다).

그런데 이게 좀 엉망이었습니다.

먼저, `pgvector`와 `pgvector.rs`는 SQL로 확장을 설치하는 방법이 다릅니다:

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

> 압니다, 글자 하나 차이일 뿐이죠...

그런데 위의 Docker Compose 예시처럼 `pgvector.rs`를 처음부터 그냥 띄우고,
다음 Drizzle ORM 스키마를 쓰면:

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

Drizzle로 `pgvector.rs` 인스턴스에 연결하면:

```typescript
export const chatMessagesTable = pgTable('chat_messages', {
  id: uuid().primaryKey().defaultRandom(),
  content: text().notNull().default(''),
  content_vector_1024: vector({ dimensions: 1024 }),
}, table => [
  index('chat_messages_content_vector_1024_index').using('hnsw', table.content_vector_1024.op('vector_cosine_ops')),
])
```

이런 오류가 발생합니다:

```txt
ERROR: access method "hnsw" does not exist
```

다행히 [ERROR: access method "hnsw" does not exist](https://github.com/tensorchord/pgvecto.rs/issues/504)
에 따라 `vectors.pgvector_compatibility` 시스템 옵션을 `on`으로 두면 해결할 수 있습니다.

당연히 컨테이너를 띄울 때 벡터 공간 관련 옵션이 자동으로 설정되길 원하므로,
`docker-compose.yml` 옆 적당한 곳에 `init.sql`을 만듭니다:

```sql
ALTER SYSTEM SET vectors.pgvector_compatibility=on;

DROP EXTENSION IF EXISTS vectors;
CREATE EXTENSION vectors;
```

그리고 `init.sql`을 Docker 컨테이너에 마운트합니다:

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
      - ./sql/init.sql:/docker-entrypoint-initdb.d/init.sql # 이 줄을 추가
      - ./.postgres/data:/var/lib/postgresql/data
    healthcheck:
      test: [CMD-SHELL, pg_isready -d $$POSTGRES_DB -U $$POSTGRES_USER]
      interval: 10s
      timeout: 5s
      retries: 5
```

Kubernetes 배포에서도 과정은 같지만, 호스트 머신의 파일을 마운트하는 대신 `ConfigMap`을 씁니다.

자, 이건 어떻게든 해결됐습니다.

이제 임베딩 이야기를 해 봅시다.

#### 임베딩 모델

이미 아실 수도 있지만, 저희는 소비자급 기기에서 돌리기 좋은 SOTA 모델들을 정리하고 벤치마크하기
위해 🥺 SAD(self hosted AI documentations)라는 또 다른 문서 사이트를 만들었습니다.
임베딩 모델은 그중에서도 가장 중요한 부분입니다. ChatGPT, DeepSeek V3, DeepSeek R1 같은 거대 LLM과 달리
임베딩 모델은 수백 메가바이트 수준으로 작아서 CPU 기기에서도 추론할 수 있습니다.
(비교하자면 DeepSeek V3 671B를 GGUF 형식 q4 양자화로 돌려도 400GiB 이상이 필요합니다.)

다만 🥺 SAD는 아직 작업 중이라, 오늘(4월 6일) 기준으로 잘나가는 임베딩 모델 몇 가지를 정리해 보겠습니다.

오픈소스와 상용 모델을 모두 포함한 리더보드:

| 순위 (Borda) | 모델 | Zero-shot | 메모리 사용량 (MB) | 파라미터 수 | 임베딩 차원 | 최대 토큰 | Mean (Task) | Mean (TaskType) | Bitext Mining | Classification | Clustering | Instruction Retrieval | Multilabel Classification | Pair Classification | Reranking | Retrieval | STS |
|--------------|-------|-----------|-------------------|----------------------|----------------------|------------|-------------|----------------|--------------|----------------|------------|------------------------|---------------------------|---------------------|-----------|-----------|-----|
| 1 | gemini-embedding-exp-03-07 | 99% | Unknown | Unknown | 3072 | 8192 | 68.32 | 59.64 | 79.28 | 71.82 | 54.99 | 5.18 | 29.16 | 83.63 | 65.58 | 67.71 | 79.40 |
| 2 | Linq-Embed-Mistral | 99% | 13563 | 7B | 4096 | 32768 | 61.47 | 54.21 | 70.34 | 62.24 | 51.27 | 0.94 | 24.77 | 80.43 | 64.37 | 58.69 | 74.86 |
| 3 | gte-Qwen2-7B-instruct | ⚠️ NA | 29040 | 7B | 3584 | 32768 | 62.51 | 56.00 | 73.92 | 61.55 | 53.36 | 4.94 | 25.48 | 85.13 | 65.55 | 60.08 | 73.98 |

직접 호스팅하는 모델만 놓고 보면:

| 순위 (Borda) | 모델 | Zero-shot | 메모리 사용량 (MB) | 파라미터 수 | 임베딩 차원 | 최대 토큰 | Mean (Task) | Mean (TaskType) | Bitext Mining | Classification | Clustering | Instruction Retrieval | Multilabel Classification | Pair Classification | Reranking | Retrieval | STS |
|--------------|-------|-----------|-------------------|----------------------|----------------------|------------|-------------|----------------|--------------|----------------|------------|------------------------|---------------------------|---------------------|-----------|-----------|-----|
| 1 | gte-Qwen2-7B-instruct | ⚠️ NA | 29040 | 7B | 3584 | 32768 | 62.51 | 56 | 73.92 | 61.55 | 53.36 | 4.94 | 25.48 | 85.13 | 65.55 | 60.08 | 73.98 |
| 2 | Linq-Embed-Mistral | 99% | 13563 | 7B | 4096 | 32768 | 61.47 | 54.21 | 70.34 | 62.24 | 51.27 | 0.94 | 24.77 | 80.43 | 64.37 | 58.69 | 74.86 |
| 3 | multilingual-e5-large-instruct | 99% | 1068 | 560M | 1024 | 514 | 63.23 | 55.17 | 80.13 | 64.94 | 51.54 | -0.4 | 22.91 | 80.86 | 62.61 | 57.12 | 76.81 |

> 더 많은 내용은 여기서 볼 수 있습니다: https://huggingface.co/spaces/mteb/leaderboard

그런데 OpenAI의 `text-embedding-3-large` 모델은 어디 갔냐고요? 리더보드에 오를 만큼 강력하지 않았던 걸까요?

네, MTEB 리더보드(4월 6일 기준)에서 `text-embedding-3-large`는 **13위** 였습니다.

클라우드 프로바이더가 제공하는 임베딩 모델에 의존하고 싶다면 다음을 고려해 보세요:

- [Gemini](https://ai.google.dev)
- [Voyage.ai](https://www.voyageai.com/)

Ollama 사용자에게는 `nomic-embed-text`가 여전히 2140만 회 이상 내려받힌 인기 모델입니다.

#### 어떻게 구현했나

Vector DB와 임베딩 모델은 마련했는데, 데이터를 어떻게 효과적으로 (재정렬 확장성까지 갖춰서)
질의할 수 있을까요?

먼저 테이블 스키마를 정의해야 합니다. Drizzle 스키마 코드는 이렇게 생겼습니다:

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

이에 대응하는 테이블 생성 SQL은 이렇습니다:

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

여기서 벡터 차원(즉 1536)이 고정이라는 점에 유의하세요. 이는 다음을 뜻합니다:

- 각 항목의 벡터를 계산한 뒤 모델을 바꾸면 재인덱싱이 필요합니다
- 모델의 차원이 다르면 재인덱싱이 필요합니다

결론적으로 애플리케이션에 맞는 차원을 지정하고, 필요할 때 적절히 재인덱싱해야 합니다.

그럼 질의는 어떻게 할까요? 새 Telegram 봇 연동에 실제로 구현한 것을 단순화해서 보겠습니다:

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

// 임계값 이상의 유사도를 가진 상위 메시지를 가져온다
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

쉽죠! 핵심은 유사도 검색을 위한

```ts
sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_1536, embedding.embedding)}))`
```

임계값을 위한

```ts
gt(similarity, 0.5)
```

그리고 정렬을 위한

```ts
query.orderBy(desc(sql`similarity`))
```

입니다.

그런데 우리는 기억 시스템을 다루고 있으니, 당연히 더 최근의 기억이 더 중요하고 회상하기도 쉬워야 합니다.
결과를 재정렬하기 위한 시간 제약 점수는 어떻게 계산할까요?

이것도 쉽습니다!

저는 한때 검색 엔진 엔지니어였는데, 보통 재정렬 표현식과 함께 10의 거듭제곱 수준의 점수 가중치를 써서
점수를 효과적으로 끌어올립니다. 결과에 5*10^2 만큼의 점수 부스트를 주는 표현식을 쓴다고 상상하시면 됩니다.

예를 들어 시간 감쇠 점수를 계산하는 함수를 이렇게 쓸 수 있습니다:

```typescript
function calculateTimeDecayScore(createdAt: Date, now: Date = new Date()): number {
  const timeDiff = now.getTime() - createdAt.getTime()
  const hoursDiff = timeDiff / (1000 * 60 * 60)

  // 지수 감쇠: 더 새로운 항목일수록 높은 점수를 받는다
  // 반감기 24시간: 24시간마다 점수가 절반으로 줄어든다
  return Math.exp(-hoursDiff / 24 * Math.LN2)
}
```

그리고 유사도 점수와 시간 감쇠를 결합할 수 있습니다:

```typescript
const finalScore = similarity * calculateTimeDecayScore(message.createdAt)
```

이렇게 하면 의미적 유사도가 약간 낮더라도 더 새로운 메시지가 더 높은 최종 점수를 갖게 됩니다.

### 캐릭터 카드 지원

Project AIRI에 캐릭터 카드 지원도 추가했습니다. 캐릭터 카드는 AI 캐릭터의 성격, 외형, 행동을
정의하는 JSON 파일입니다. 많은 AI 캐릭터 플랫폼이 쓰는 인기 있는 V2/V3 형식을 따릅니다.

간단한 캐릭터 카드 예시입니다:

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

이 캐릭터 카드를 읽어 AI의 동작을 그에 맞게 설정하는 파서를 구현했습니다. 시스템은 단순한 텍스트
기반 카드는 물론, 이미지와 메타데이터가 내장된 더 복잡한 카드도 지원합니다.

### 테마 개선

Project AIRI의 비주얼 테마를 개선하는 작업을 해 왔습니다. 새 테마 시스템은 이제 다음을 지원합니다:

- 여러 색 구성(라이트, 다크, 자동)
- 커스텀 강조 색상
- 접근성을 위한 개선된 명암비
- 테마 전환 시 부드러운 트랜지션

새 테마 시스템 사용 예시입니다:

```typescript
// 프로그래밍 방식으로 테마 설정
setTheme('dark')

// 또는 시스템 설정에 따른 자동 감지
setTheme('auto')

// 커스텀 강조 색상
setAccentColor('#ff6b6b')
```

테마 변경 사항은 localStorage로 세션 간에 유지되므로, 사용자가 방문할 때마다 다시 설정할 필요가 없습니다.

### 커뮤니티 기여

커뮤니티가 Project AIRI에 기여하기 시작해서 기쁩니다! 눈에 띄는 기여로는 이런 것들이 있습니다:

- **Awesome AI VTuber List**: AI VTuber 프로젝트와 자료를 정리한 목록
- **ReLU 스티커 팩**: 다양한 표정의 ReLU를 담은 커스텀 스티커 모음
- **문서 개선**: 많은 커뮤니티 멤버가 문서 개선을 도와주고 있습니다

모든 지원과 기여에 감사드립니다. 기여하고 싶으시다면
[기여 가이드라인](https://github.com/moeru-ai/airi/blob/main/CONTRIBUTING.md)을 확인해 주세요.

## 다음 계획

앞으로는 다음을 준비하고 있습니다:

1. **기억 시스템 개선**: 회상 정확도와 효율 향상
2. **멀티모달 지원**: 이미지와 오디오 생성 기능 추가
3. **플러그인 시스템**: 서드파티 확장으로 기능을 강화
4. **모바일 앱**: iOS와 Android용 네이티브 애플리케이션

Project AIRI 각 구성 요소에 대한 더 상세한 문서도 아키텍처 심층 분석과 구현 가이드를 포함해
공개할 계획입니다.

## 맺으며

Project AIRI에게 신나는 개발 기간이었습니다. 기억 시스템이 모습을 갖춰 가고, 캐릭터 카드 지원도
잘 동작하며, 테마 개선으로 인터페이스가 훨씬 정돈됐습니다.

무엇보다 ReLU가 자신만의 성격을 키우고 심지어 시까지 쓰는 모습을 보는 것이 정말 큰 보람이었습니다.
저희가 애초에 이 프로젝트를 시작한 이유, 즉 진짜 같고 매력적인 AI 상호작용을 만들고 싶다는 마음을
다시 떠올리게 해 줍니다.

언제나처럼 저희 개발 여정을 함께해 주셔서 감사합니다. 여러분의 성원과 피드백에 감사드립니다!

— Project AIRI 팀
