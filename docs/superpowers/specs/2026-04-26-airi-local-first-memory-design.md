# AIRI Local-First Memory Design

**Status:** Approved for implementation planning

**Goal:** Make AIRI read realtime memory from local SQLite during chat, keep only a bounded local short-term raw-memory window, and let cloud LangMem turn the full uploaded experience stream into long-term memory patches that are cached back into SQLite.

**Scope assumption:** V1 targets the Electron desktop runtime in `apps/stage-tamagotchi` as the first-class SQLite host. Shared stage UI code will consume a runtime-agnostic memory gateway, and web/mobile can keep their current local storage path until a later adapter is added.

## Why This Design

The current repository has three partial memory directions:

- local IndexedDB persistence for sessions and local-first app data
- a DuckDB proof-of-concept that is not in the realtime chat path
- Telegram-side pgvector retrieval that lives in a server/service lane

That means AIRI does not yet have one unified memory path for realtime interaction. This design makes the desktop app use local SQLite as the realtime memory source, while cloud LangMem is the long-term memory formation system. The local store keeps short-term raw detail plus the latest cloud-consolidated memory copy; it is not expected to keep every raw turn forever.

## Design Principles

- Realtime chat must never wait on cloud memory work.
- Every turn must be durable locally before any background sync starts.
- The local store is the interaction-time source of truth.
- Cloud LangMem is the long-term memory compression and consolidation source.
- Local raw turns are retained as a configurable short-term window, not as infinite local history.
- Cloud output is a memory patch that refreshes the local long-term memory copy.
- Recent turns outrank summaries when prompt budget is tight.
- Long-term memory should be merged incrementally and versioned defensively.

## Final Architecture Summary

AIRI's realtime chat path reads memory only from local SQLite. The local database contains two prompt-visible memory layers:

1. A bounded short-term memory window, such as the most recent N days of raw or prompt-ready turns.
2. A local copy of long-term memory distilled by cloud LangMem, such as `profile_summary`, `stable_facts`, and `memory_cards`.

The full experience stream is uploaded from local `raw_turn_log` in the background. Cloud LangMem slowly summarizes, extracts stable facts, and creates memory cards from that uploaded stream. The desktop app later pulls a memory patch and merges the distilled result back into SQLite.

In one sentence:

> AIRI keeps short-term experience and long-term memory essence locally for fast chat, while cloud LangMem compresses the complete uploaded experience stream into long-term memory patches.

The prompt-critical read model is:

```txt
local_runtime_memory_context =
  local_short_term_recent_window
  + local_copy_of_cloud_consolidated_memory
```

The important invariant is:

> Cloud creates consolidated long-term memory; local SQLite serves it on the live chat path.

## High-Level Architecture

The V1 architecture has four moving parts:

1. A local SQLite memory database owned by the desktop runtime.
2. A renderer-facing memory gateway for reads, writes, and sync state.
3. A background sync agent that uploads raw turn deltas and safely prunes local raw turns after retention rules allow it.
4. A cloud LangMem worker that summarizes, extracts facts, creates memory cards, and returns memory patches.

The realtime chat path is:

1. User submits input.
2. AIRI reads local memory context from SQLite: recent local window plus cloud-consolidated long-term memory copy.
3. AIRI writes the user turn to local SQLite.
4. AIRI calls the LLM.
5. AIRI writes the assistant turn to local SQLite.
6. AIRI marks new raw turns as pending for background sync.

The cloud path is:

1. Local sync agent batches unsynced raw turns from the short-term raw log.
2. Cloud LangMem ingests the uploaded experience stream and generates consolidated memory patches.
3. Desktop pulls the newest patch set by version or cursor.
4. Local merge logic updates summary, facts, and memory cards in SQLite.
5. Local cleanup prunes raw turns outside the configured retention window only after upload acknowledgement.

## Local Memory Model

V1 keeps five primary memory content buckets plus one sync state table.

### `profile_summary`

Purpose:
Compressed user and relationship summary used first in prompt assembly.

Properties:
- scoped by `user_id` and `character_id`
- single current active summary row per scope
- includes `summary_version`
- includes `generated_from_turn_id`
- includes `updated_at`

### `stable_facts`

Purpose:
Persistent facts that should outlive recent chat windows.

Properties:
- scoped by `user_id` and `character_id`
- includes `fact_key`, `fact_value`, `confidence`
- includes `updated_at`
- includes `superseded_by`
- supports soft replacement rather than destructive overwrite

### `recent_turns`

Purpose:
Fast prompt-ready rolling short-term conversation memory.

Properties:
- scoped by `user_id`, `character_id`, and `session_id`
- contains the latest prompt-eligible turns inside the configured local retention window
- pruned by turn count and age after the raw source has been durably handled
- optimized for direct prompt assembly without extra transformation

### `raw_turn_log`

Purpose:
Local short-term raw turn buffer for upload, retry, and recent-detail recall.

Properties:
- scoped by `user_id`, `character_id`, and `session_id`
- contains user and assistant turns that are still inside the configured local retention or sync safety window
- each row has a unique `turn_id`
- tracks `sync_status`
- is uploaded to cloud LangMem as the source stream for long-term memory formation
- is not retained forever locally
- is never used directly as the default prompt source

### `memory_cards`

Purpose:
Cloud-consolidated long-term memory essence cached locally for optional recall.

Properties:
- scoped by `user_id` and `character_id`
- stores short cloud-generated digests or recall cards
- includes tags, entities, salience, and source turn range
- can later support SQLite FTS5 without entering the default fast path

### `sync_state`

Purpose:
Track upload, patch pull, merge, and retention progress safely.

Properties:
- scoped by `user_id` and `character_id`
- stores `last_uploaded_turn_id`
- stores `last_applied_summary_version`
- stores cloud acknowledgement or cursor data needed before pruning local raw turns
- stores last sync timestamps and retry counters

## Realtime Read Order

Default prompt read order is:

1. `profile_summary`
2. `stable_facts`
3. `recent_turns`

Optional enhancement:

- `memory_cards` are read only when a recall trigger is detected
- examples: "你还记得吗", "我之前说过", clear cross-session references, or explicit reflective prompts

`recent_turns` must outrank `profile_summary` and `stable_facts` when there is tension between recent corrections and older summarized state. Recent raw detail is the short-term working memory; cloud-consolidated data is the long-term memory essence.

## Realtime Write Policy

Realtime writes must stay intentionally lightweight.

On user input:

- append a `raw_turn_log` row
- update `recent_turns`
- mark sync state dirty

On assistant completion:

- append a `raw_turn_log` row
- update `recent_turns`
- mark sync state dirty

V1 does not do any of the following in the critical path:

- cloud upload
- embedding generation
- vector retrieval
- summarization
- fact extraction
- patch merging

## Background Upload Policy

The local client should upload raw turn log deltas asynchronously when any trigger fires:

- 4 new conversation turns
- around 2000 new CJK characters of text
- 90 seconds since the last upload
- 8 seconds of user idle time after a completed exchange

These values are V1 defaults and must be configurable.

## Local Retention Policy

Local raw memory retention is a product parameter. Examples include "recent 7 days" or "recent 30 days", but the architecture treats this as a configurable policy rather than a fixed truth.

The retention window applies to short-term raw or prompt-ready turn data:

- `raw_turn_log`
- `recent_turns`

The retention window does not apply to cloud-consolidated long-term memory:

- `profile_summary`
- `stable_facts`
- `memory_cards`

Raw turns may be pruned only when both conditions are true:

1. The turn is outside the configured local retention window.
2. The cloud sync layer has acknowledged receiving the turn, or an equivalent upload cursor proves that the turn is safe to remove locally.

This prevents offline or failed-sync periods from silently deleting experiences that cloud LangMem never received.

## Cloud Summarization Policy

Cloud LangMem should summarize less frequently than upload.

Suggested default triggers:

- 12 new conversation turns
- around 8000 new CJK characters
- 15 minutes since the last summarization run

Cloud output should include:

- `summary_patch`
- `facts_patch`
- `memory_cards`
- `summary_version`
- `generated_from_turn_id`
- an acknowledgement cursor or processed source range that lets the desktop decide which raw turns are safe to prune

## Merge Rules

Local merge logic must be deterministic and defensive.

- Never apply a patch with an older `summary_version`.
- Never apply a patch whose `generated_from_turn_id` is behind the latest applied checkpoint for that scope.
- Facts must be superseded, not blindly overwritten.
- Recent turns are always local-source-of-truth for the current active session.
- Cloud patches may improve long-term context, but they cannot rewrite the meaning of the latest local session turns.
- Patch merge must not depend on retaining old raw turns locally after they have been acknowledged and pruned.

## Runtime Boundaries

V1 runtime ownership:

- SQLite file lives in Electron main process storage.
- renderer accesses memory through Eventa contracts
- shared `packages/stage-ui` code talks to a memory gateway interface, not directly to Node SQLite APIs

This boundary keeps desktop-specific persistence inside Electron while preserving shared UI/store logic.

## Rollout Strategy

V1 should ship in three slices:

1. Replace the current desktop chat session persistence path with a local SQLite-backed memory gateway for prompt-critical data.
2. Add background raw turn sync and patch application plumbing without turning on cloud summarization-dependent prompt reads.
3. Add retention-window pruning for uploaded raw turns and optional `memory_cards` local recall triggers after the fast path is stable.

## Non-Goals For V1

- no cloud dependency in prompt assembly
- no realtime vector retrieval in the default path
- no cross-platform SQLite parity for web/mobile in the first slice
- no emotional scoring, forgetting curve, or autonomous dream processing in V1
- no promise that local raw turn history is retained forever

## Success Criteria

The design is successful when:

- desktop AIRI can restart without losing prompt-critical memory
- prompt assembly reads only local memory during realtime chat
- cloud downtime does not block interaction
- old cloud summaries cannot overwrite newer local state
- sync happens in the background without user-visible chat stalls
- raw turns outside the local retention window are pruned only after upload acknowledgement
- chat reads the recent local window plus cloud-consolidated long-term memory copy
