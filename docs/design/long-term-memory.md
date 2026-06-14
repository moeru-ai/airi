# Long-Term Memory (LTM) — Design

Status: design (approved decisions below). Branch: `feat/memory-local`.

## Goal

Give AIRI durable, cross-session memory about the user, the world, and the
relationship: it forms memories from conversation, recalls the relevant ones on
each turn, and feeds them to the chat backbone as context — so she "remembers"
without the user re-stating things every session.

This is distinct from:

- **Working memory** — the existing `[Context]` block (vision, Minecraft state),
  transient per-turn. Reused as the *injection channel* (see Recall).
- **Short-term truncation** — compacting old turns to fit the context window.
  Deferred: the backbone (DeepSeek V4, hundreds of K context) keeps raw history
  verbatim by default; truncation is a future safety valve, not part of LTM.

## Decisions (locked)

| Topic | Decision |
| --- | --- |
| Store | DuckDB-WASM, local-first (renderer process). pgvector kept as an optional backend behind a port, later. |
| Embedding | `bge-m3` (1024-dim). Dimension is configurable; default 1024. (Existing `memory_test FLOAT[768]` scaffold is replaced.) |
| Write trigger | Hybrid: session-end (primary) + every ~20–30 turns (top-up). Not gated on context pressure. |
| Extraction | LLM fact extraction (structured memory items), not raw summarization. |
| Recall | Every user turn: embed query → top-k → hybrid score → threshold → inject via `context:update`. |
| Scope | Per character (+ user), like chat sessions. |

## Architecture

```
WRITE (memory formation)              RECALL (per user turn)
──────────────────────                ──────────────────────
session-end / every N turns           user sends input:text
   │                                     │
   ▼                                     ▼
extract facts (LLM)                   embed query (bge-m3)
   │  {text,type,salience,...}           │
   ▼                                     ▼
dedup / merge vs existing             vector search top-k (DuckDB cosine)
   │  (semantic similarity)              │
   ▼                                     ▼
embed (bge-m3, 1024)                  hybrid score = sim × recency × salience
   │                                     │  + threshold filter
   ▼                                     ▼
MemoryStore.insert/update             sendContextUpdate(AppendSelf, 'memory')
   │                                     │  → [Memory] block in [Context]
   ▼                                     ▼
DuckDB (memories table)               backbone reads it on this turn
```

Both paths reuse existing infra: the embed-provider abstraction, and the
`context:update` → `formatContextPromptText` injection used by vision (so **no
backbone protocol change**).

## Module layout

- `packages/memory-core` (new, env-neutral, pure):
  - `MemoryRecord`, `MemoryQuery`, scoring (`hybridScore`), the extraction
    prompt contract, the dedup policy. No DOM/Node deps.
  - `MemoryStore` port: `insert`, `search(embedding, k, filter)`, `update`,
    `delete`, `list`, `count`.
- `packages/stage-ui/src/stores/modules/memory/`:
  - `duckdb-store.ts` — `MemoryStore` impl over `use-duck-db` (default).
  - `embedder.ts` — wraps the configured embed provider (`@xsai/embed`).
  - `store.ts` — Pinia: settings (enabled, embed provider/model, dim, k,
    threshold, write cadence), orchestration of write + recall.
- Optional later: `PgVectorMemoryStore` in the existing `memory-pgvector`
  server-channel module (same port).
- Chat wiring in `packages/stage-ui/src/stores/chat.ts` (recall before send,
  write on lifecycle hooks).
- Settings: fill `settings/modules/memory-long-term.vue` (currently `<WIP/>`).

## DuckDB schema

```sql
CREATE TABLE IF NOT EXISTS memories (
  id          TEXT PRIMARY KEY,
  character   TEXT NOT NULL,       -- scope: airi-card id
  user_id     TEXT,                -- scope: user (nullable for local-only)
  text        TEXT NOT NULL,       -- the remembered fact, first-person-friendly
  type        TEXT NOT NULL,       -- preference | fact | event | relationship | commitment
  embedding   FLOAT[1024] NOT NULL,
  salience    DOUBLE  NOT NULL DEFAULT 1.0,
  created_at  BIGINT  NOT NULL,
  updated_at  BIGINT  NOT NULL,
  last_recalled_at BIGINT,
  source_session TEXT
);
```

Search (brute-force cosine; fine for hundreds–thousands of rows):

```sql
SELECT *, array_cosine_similarity(embedding, $query) AS sim
FROM memories
WHERE character = $char AND (user_id = $user OR user_id IS NULL)
ORDER BY sim DESC
LIMIT $k;
```

Hybrid re-rank in JS: `score = sim * recencyDecay(updated_at) * log1p(salience)`,
then drop anything below `simThreshold`. (HNSW via DuckDB `vss` extension is a
later optimization; not needed at this scale.)

## Write path

Trigger (hybrid): on session-end, and every ~20–30 turns as a top-up. Reads the
recent raw turns (kept verbatim) directly.

1. **Extract** — one LLM call (reuse the chat backbone for voice consistency):
   "From this exchange, list durable facts worth long-term memory (user
   preferences, facts about the user/world, commitments, notable events).
   Return structured items; skip small talk." → `{text, type}[]`.
2. **Dedup / merge** — embed each candidate, search existing; if a near-duplicate
   exists (sim ≥ mergeThreshold), reinforce it (salience += 1, refresh
   `updated_at`) and skip insert; if it contradicts, update the text.
3. **Embed + insert** new items.

## Recall path

On each user `input:text` turn, before `buildProviderMessages`:

1. Embed the user input (+ optionally the last turn for context).
2. `MemoryStore.search(embedding, k)` (k ~ 5–8).
3. Hybrid re-rank + threshold; bump `last_recalled_at` and salience on the
   survivors (reinforcement).
4. `sendContextUpdate({ strategy: AppendSelf, contextId: 'memory', text, ... })`
   so it lands in the `[Context]` block as a `[Memory]` section.
5. A system-prompt supplement (like the vision-awareness line) tells the persona
   that `memory:` context entries are things she remembers.

## Settings (fill the WIP page)

Enable toggle · embed provider + model (bge-m3) · dimension · top-k · similarity
threshold · write cadence (turns) · memory browser (list / edit / delete /
salience). Per-character scope shown.

## Operational prerequisite (user-side)

`bge-m3` must be served as an OpenAI-compatible embeddings endpoint and
configured as an **embed** provider in AIRI. Options:

- Ollama: `ollama pull bge-m3` → `POST /v1/embeddings` on `:11434`.
- A small local adapter (like the VLM/TTS ones) on a new port (e.g. `9883`)
  using `FlagEmbedding`/`sentence-transformers`. ~2GB, runs on CPU or small GPU.

## Build phases

- **P1** — `MemoryStore` port + DuckDB impl (schema, insert/search/update/
  delete) + unit tests. Foundational, self-contained.
- **P2** — `embedder.ts` over the embed provider; wire bge-m3; smoke test.
- **P3** — Recall path (search → score → inject) + system-prompt framing.
- **P4** — Write path (extract → dedup/merge → store) + hybrid trigger.
- **P5** — Settings UI (config + memory browser) on the WIP page.
- **P6** — Polish: salience decay job, per-character scoping, edge cases.

Each phase lands as its own commit on `feat/memory-local`, then merges
`--no-ff` into `integration/local-all` for live observation.

## Deferred

- STM context truncation (safety valve at a high token budget) — not needed for
  the long-context backbone.
- pgvector backend (server-channel) — second `MemoryStore` impl behind the port.
- Memory consolidation (periodic merge of related memories into higher-level
  summaries).
