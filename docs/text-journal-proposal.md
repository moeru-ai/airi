# AIRI Text Journal Proposal

This document outlines a first-pass design for a durable `text_journal` feature that gives AIRI a native place to write down thoughts, reflections, memories, and discoveries over time.

The goal is not to build a full notes app. The goal is to give AIRI a first-class memory surface that feels as natural as a journal:

- append-only by default
- easy to write to
- easy to search
- no id micromanagement exposed to the model
- no delete/edit powers in the first version

This should be treated as a sibling concept to the planned `image_journal`, not as a generic database browser.

## 1. Product Framing

The simplest way to think about `text_journal` is:

- AIRI writes entries
- AIRI can look up relevant entries later
- AIRI does not need to manage records manually

This is intentionally different from a CRUD-style memory system.

We do **not** want the first version to feel like:

- a table editor
- a knowledge-base admin panel
- a list/delete/update workflow

We want it to feel more like:

- "write this down"
- "what have I written about this before?"
- "use the journal as memory context"

## 2. Why This Exists

There are a few practical reasons to add this:

1. AIRI needs a durable place for self-authored memory that survives sessions.
2. A journal metaphor is easier to reason about than arbitrary memory tables.
3. Semantic retrieval over journal entries is more realistic than expecting the LLM to remember everything from raw history.
4. It creates a clean future path for autonomous reflection without overloading chat history itself.

## 3. MVP Tool Shape

The model-facing tool should stay very small.

Initial actions:

- `write`
  - append a new journal entry
- `search`
  - return relevant prior entries

That is enough to unlock the core behavior:

- AIRI can record important thoughts
- AIRI can retrieve prior memories when they matter

We should **not** ship these in v1:

- `delete`
- `edit`
- `list all`
- `open by id`

Those are admin mechanics, not journal behavior.

## 4. Entry Shape

Each journal entry should be simple but structured enough to support later retrieval and filtering.

Suggested record shape:

```ts
interface TextJournalEntry {
  id: string
  createdAt: string
  ownerCardId?: string
  ownerCharacterName?: string
  title?: string
  content: string
  tags?: string[]
  source?: 'user' | 'proactivity' | 'chat' | 'unknown'
  metadata?: Record<string, unknown>
}
```

Notes:

- `content` is the important part
- `title` is optional but useful when AIRI naturally wants to label a thought
- `ownerCardId` allows later per-character journal separation
- `source` helps distinguish how an entry was created without overcomplicating the first version

Recommended source meanings for MVP:

- `user`
  - explicitly user-authored text or a user-triggered save action if that ever exists
- `proactivity`
  - AIRI wrote the entry during a heartbeat/proactive turn
- `chat`
  - AIRI wrote the entry during or immediately after a normal chat-driven interaction
- `unknown`
  - fallback when the origin is unclear

## 5. Storage Direction

`localStorage` is the wrong storage for this.

Recommended storage direction:

- `IndexedDB` for entry metadata and lookup index

Why `IndexedDB` makes sense:

- larger storage budget than `localStorage`
- async by design
- better suited for collections of records
- works naturally for append-only journals and future search metadata

This should be treated as durable local app state, not as lightweight UI preference storage.

## 6. Retrieval Model

The key differentiator of `text_journal` is not just storage. It is retrieval.

The intended long-term lookup model is:

- AIRI supplies a query
- the system performs semantic search over prior entries
- relevant entries are returned as context

This is better than keyword-only matching because journal entries will often be emotional, narrative, or indirect.

However, that should **not** be the MVP.

The practical MVP retrieval model should be:

- keyword search over `title`, `content`, and `tags`
- simple local filtering in IndexedDB-backed records
- semantic retrieval deferred until there is a proper embeddings/indexing layer

Examples:

- "what have I said before about Richard's coding habits?"
- "have I written about feeling tired lately?"
- "did I already reflect on this background change?"

This makes the journal functionally useful instead of becoming a write-only dump.

## 7. Proactivity Integration

There is a natural proactivity tie-in here, but we should keep the first implementation modest.

One strong idea:

- per proactive trigger, AIRI may optionally spend one extra turn writing to `text_journal`

This would let her:

- reflect after a heartbeat
- summarize her mood or recent observations
- preserve autonomous thoughts without dumping them into visible chat

Important note:

this likely does **not** require a bespoke checkbox if the tool is available and the prompting is good enough.

Possible product shapes:

1. Prompt-driven only
   - the tool exists
   - AIRI is instructed when to use it
2. Optional toggle later
   - "Allow proactive journal writing"
   - useful if we want to gate autonomy or omit the tool from the default toolchain

The first pass should avoid overcommitting here. The tool itself matters more than the checkbox.

## 8. UI Direction

The first version should avoid becoming a full note-management interface.

A practical minimal UI would be:

- a journal viewer surface
- reverse chronological entries
- search box
- no date filters in MVP
- optional card/character filtering later

This can stay simple because the primary value is:

- storage
- retrieval
- integration with AIRI behavior

not rich document editing.

## 9. Relationship to Memory

This feature should not be framed as "all memory."

It is specifically:

- self-authored textual memory
- journal-style durable reflection

Other memory systems may still exist later:

- structured user facts
- preferences
- embeddings over chat history
- world-state snapshots

But `text_journal` is a very clean first step because it is legible, intuitive, and useful.

## 10. Suggested MVP Sequence

### Phase 1

- add `text_journal` storage layer in IndexedDB
- add `write`
- add basic keyword retrieval over title/content/tags
- no edit/delete/list-all controls
- no date filtering

### Phase 2

- semantic search improvement
- better entry titles/tags
- card-aware ownership and filtering

### Phase 3

- proactive reflection integration
- optional toolchain gating/toggle if needed
- richer memory-context retrieval policies

## 11. Open Questions

These are the main things still worth deciding before implementation:

1. Should entries always be tied to the active card, or can AIRI write global journal entries too?
2. Should journal writes be visible anywhere in chat/session UI, or remain journal-only?
3. What semantic search backend do we want to use locally?
4. Should we allow user-authored journal entries in v1, or keep the first version AI-authored only?
5. Should proactive journaling be prompt-crafted only at first, or explicitly gated by settings?

## 12. Current Recommendation

The clean first implementation is:

- durable local `IndexedDB` storage
- append-only entry model
- `write` + `search`
- keyword search first, semantic search later
- no edit/delete surface
- no date filters in MVP
- no LLM-facing id management
- no giant control panel

That gives AIRI a useful memory primitive without dragging the project into an overbuilt personal-knowledge-management system.
