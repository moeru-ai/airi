# AIRI Long-Term Memory

This document reframes the current `text_journal` direction as AIRI's long-term memory layer.

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

- `write`
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
