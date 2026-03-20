# AIRI Memory Architecture

This document defines the intended split between AIRI short-term memory and long-term memory.

The most important rule is:

- memory is **per character first**

The system is already character-centric. Memory should follow that same model. A global undifferentiated memory bucket is the wrong default because it blurs separate identities together.

## 1. Two-Layer Model

### Short-Term Memory

Short-term memory is:

- derived
- recent
- bounded
- automatically injected into prompt context

It is not raw memory storage. It is a compact context-builder layer.

### Long-Term Memory

Long-term memory is:

- durable
- append-only
- lookup-oriented
- not always injected into prompt context

It acts as the archive AIRI can write to and search later.

## 2. Character Scope

Both memory layers should support a per-character boundary.

That means:

- short-term summaries belong to a specific character
- long-term journal entries belong to a specific character
- UI views need a per-character filter
- retrieval should prefer the active character by default

Global/shared memory can exist later if there is a strong reason for it, but it should not be the default architecture.

## 3. Practical Mapping

### Short-Term

- source in MVP: recent per-character chat history
- format: one summary block per day
- use: loaded into prompt context automatically
- retention window: configurable

Future options can expand this to:

- chat-only
- journal-only
- hybrid

But the MVP should stay unambiguous: short-term memory is distilled from chat history first.

### Long-Term

- source: raw journal entries
- format: timestamped text entries
- use: tool-based lookup and recall
- retention: durable until user clears data

## 4. Recommended Defaults

For short-term memory:

- window size: `3 days`
- token budget per day: `1000`

These are defaults, not hard opinions. Different models and context widths justify different budgets.

## 5. Settings Philosophy

The first useful knobs for short-term memory are:

- window size
- token budget per day

That gives users meaningful control without turning memory into a huge tuning panel.

## 6. Current Implementation Snapshot

The current implementation order ended up being:

1. short-term memory rebuild and session injection
2. long-term journal tool and archive UI

That is acceptable because both layers are now real enough to validate:

- short-term already proves continuity injection
- long-term already proves durable write + lookup

The next useful direction is to deepen both rather than restart either:

- short-term: better rollover behavior and settings-driven injection window
- long-term: better ranking and semantic search after unified lookup

## 7. Immediate Next Hooks

Two hooks now matter more than broad new memory ideas:

1. `Yesterday` short-term generation
   - after local midnight, generate one immutable summary block for yesterday
   - do it on the first eligible run rather than constantly rewriting memory
   - keep it per character
   - status: implemented for the active character path

2. unified memory lookup
   - treat long-term journal search as the first layer
   - if long-term has no useful hit, fall back to short-term blocks for that same character
   - make retrieval feel like one memory system even though storage remains split
   - status: implemented as the current `text_journal.search` behavior

This is a better next step than jumping straight to semantic search, because it improves recall coverage immediately using the layers AIRI already has.

## 8. Related Docs

- `docs/long-term-memory.md`
- `docs/short-term-memory.md`
