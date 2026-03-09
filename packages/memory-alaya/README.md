# @proj-airi/memory-alaya

Alaya memory layer contracts plus planner/query engines for AIRI.

## What It Does

- Defines stable `v2` contracts for Alaya memory entities and planner/query IO.
- Exposes decoupled ports for workspace reads, short-term memory storage/reading, LLM extraction, embeddings, and token estimation.
- Keeps AIRI-specific adapters outside this package; runtime wiring lives in `packages/stage-ui`.
- Provides a planner use case for `workspace -> short_term` batch filtering with:
  - LLM-first memory selection
  - fallback heuristic extraction when planner LLM is unavailable
  - per-memory summary output
  - per-memory embedding generation
  - decay/half-life initialization
- Provides a query engine for `short_term -> recall context` assembly with:
  - vector-first scoring plus keyword fallback
  - score composition from similarity, importance, time, and emotion
  - recall thresholds
  - access activity updates (`lastAccessedAt`, `accessCount`)
  - compact reference-only recall context output
- Provides scheduler trigger policy helpers (scheduled/manual).

## Current Scope

- Current MVP scope is short-term memory only.
- Current stored memory is user memory only.
- Current short-term memory records are summary-based distilled memories, with optional embeddings.
- Planner and query engines are implemented.
- Recall output is compact, reference-only context assembled from short-term memory.

## Not Implemented Yet

- Mutate engine for dedupe, merge, conflict handling, and memory mutation workflows.
- Voyager engine for forgetting, decay progression, compaction, and short-term to long-term promotion.
- Long-term memory pipeline and long-term memory storage.
- Agent memory, agent self-memory, and agent internal state persistence.
- Ongoing self-evolution or self-state learning loops for the assistant.

## How To Use

1. Implement adapters for these ports:
   - `WorkspaceMemorySource`
   - `ShortTermMemoryStore`
   - `ShortTermMemoryActivityStore` (optional, for recall access updates)
   - `MemoryLlmProvider`
   - `MemoryEmbeddingProvider` (optional for query recall, recommended for planner/query parity)
2. Construct planner dependencies and call `runPlannerBatch`.
3. Construct query dependencies and call `runQueryEngine` (or `createQueryEngine().execute`).
4. Persist checkpoints and run planner with scheduler triggers.

```ts
import { runPlannerBatch, runQueryEngine } from '@proj-airi/memory-alaya'
```

## When To Use

- Building or integrating AIRI Alaya short-term memory pipeline.
- You need stable contracts while progressively adding mutate/voyager engines and long-term memory capabilities.
- You want to keep model/storage providers swappable.

## When Not To Use

- You need a full production memory stack with mutate/voyager already implemented.
- You need agent memory or agent internal state memory right now.
- You need long-term memory migration in the same module right now.
- You want tight coupling to one specific LLM or vector DB implementation.
