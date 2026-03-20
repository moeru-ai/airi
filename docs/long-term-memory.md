# AIRI Long-Term Memory

This document reframes the current `text_journal` direction as AIRI's long-term memory layer.

## Status

Implemented today:

- real `text_journal` tool
- `create` action
- `search` action
- per-character IndexedDB-backed long-term journal storage
- real long-term memory settings page backed by stored entries
- unified search fallback into short-term memory blocks when long-term has no journal hit

Still next:

- better retrieval formatting / ranking
- semantic search beyond keywords
- optional proactive or user-authored journal flows

Potential future direction:

- QMD CLI-backed semantic retrieval as an external/local dependency boundary

## 1. Purpose

Long-term memory is the durable archive.

It should:

- store timestamped text entries
- remain append-only in the first version
- support lookup/search
- stay scoped per character

This is not a CRUD-heavy notes app. It is a memory archive AIRI can write to and search later.

## 2. Data Model

Suggested record shape:

```ts
interface LongTermMemoryEntry {
  id: string
  createdAt: string
  ownerCardId: string
  ownerCharacterName?: string
  title?: string
  content: string
  tags?: string[]
  source?: 'user' | 'proactivity' | 'chat' | 'unknown'
  metadata?: Record<string, unknown>
}
```

The important parts are:

- `ownerCardId`
- `createdAt`
- `content`

## 3. Storage

Recommended storage:

- `IndexedDB`

Why:

- durable local storage
- async
- better for collections than `localStorage`

## 4. MVP Tool Shape

Keep the tool very small:

- `create`
- `search`

Do not ship these in the first version:

- `delete`
- `edit`
- `list all`
- `open by id`

## 5. Search

MVP search should be:

- keyword/text search over title/content/tags

Semantic search should be deferred until there is a proper embeddings/index layer.

One promising future direction is to treat semantic search as an external retrieval engine rather than something AIRI fully owns in-process.

Potential shape:

- keep AIRI responsible for journal storage, per-character scoping, and tool/UI behavior
- use a QMD CLI-backed manager layer for embeddings / semantic indexing / retrieval
- let the user install and maintain that dependency explicitly
- avoid baking vector infra, embedding model management, and retrieval tuning directly into AIRI core

That would be a deliberate departure from a pure in-repo implementation, but it could drastically reduce maintenance complexity inside AIRI itself while still enabling proper semantic lookup later.

## 5A. Current Implemented Search

The current implementation is:

- active-character-first keyword search
- match against title, content, and character label
- simple scoring and recency ordering
- if long-term has no hit, fall back to short-term memory blocks for that same character

This is intentionally basic but already useful enough to prove lookup behavior end to end.

## 5B. Planned Unified Lookup

The next useful retrieval step is not "semantic search first." It is a cleaner **memory lookup path**:

- search the active character's long-term journal first
- if no meaningful long-term hit exists, search that same character's short-term memory blocks
- return whichever layer actually contains the best available memory

Why this matters:

- after a few days, not every useful short-term block will still be injected into prompt context
- a character should still be able to recall recent continuity even when it has rolled out of the live injected window
- this gives AIRI a more seamless memory story without forcing the model to know which storage layer it should ask for

In other words, the retrieval surface should feel unified even if the storage layers remain distinct.

## 6. UI Direction

Long-term memory should be shown as a text-first list view.

Suggested row shape:

- timestamp
- optional title
- truncated text preview
- source badge

Important:

- the UI needs a per-character filter
- the active character should be the default filter

The current UI now does this with real data rather than mock entries.

## 7. Relationship to Short-Term Memory

Long-term memory is the raw archive.

Short-term memory is not stored the same way. It should be treated as a derived recent summary layer, not a second copy of the full archive.

## 8. Rebuild Expectations

Long-term memory does not need a "rebuild from history" button in the same way short-term memory does.

It is the raw source material.

The main job here is:

- write entries
- search entries
- preserve them per character
