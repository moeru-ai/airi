# AIRI Short-Term Memory

This document defines AIRI short-term memory as a derived summary layer, not a raw journal.

## Status

Implemented today:

- real `Rebuild from history`
- per-character IndexedDB-backed daily summary storage
- per-character short-term memory settings page
- initial session injection for the active character
- automatic "yesterday" generation on first eligible run for the active character

Still next:

- configurable injection window actually applied from settings
- richer compaction / rollover logic

## 1. Purpose

Short-term memory exists to preload recent continuity into new or resumed chat sessions without stuffing entire recent histories into the prompt.

It should be:

- recent
- dense
- bounded
- per character

In the MVP, short-term memory should be derived from per-character chat history.

## 2. Core Model

The right mental model is:

- one summary block per day
- each block belongs to a specific character
- only the most recent `N` days are injected into context

Suggested defaults:

- window size: `3 days`
- token budget per day: `1000`

These should be configurable.

## 3. Why This Is Different From Long-Term

Long-term memory stores raw entries.

Short-term memory stores:

- summaries
- compactions
- reinforced recent context

So short-term memory is a context-builder hook, while long-term memory is a tooling/search hook.

Important MVP clarification:

- short-term memory should summarize chat history first
- it should not depend on long-term journal adoption to be useful
- journal-derived or hybrid summary modes can be added later

## 4. Summary Timing

A clean model is:

- yesterday's summary becomes eligible after midnight
- the app generates it on the first eligible run after that point

That keeps each day stable instead of constantly rewriting live daily memory blocks.

This automatic path is separate from backfill.

There are two distinct generation modes:

1. `Rebuild from history`
   - manual
   - used to backfill existing conversations into short-term blocks
2. post-midnight summary generation
   - automatic
   - used to keep recent daily blocks up to date going forward

The intended automatic shape is:

- only summarize **yesterday**, never "today"
- treat the block as immutable once generated
- run on the first eligible app session after local midnight
- gate per character so each character only gets one generated block for that date
- skip days that already have a block unless the user explicitly rebuilds

## 5. Settings / Knobs

The first useful knobs are:

- `window size`
- `token budget per day`

Examples:

- small local model: keep both low
- large-context remote model: raise either or both

## 6. UI Direction

The UI can still be list-based, similar to long-term memory, because the core content is still timestamped markdown-like text.

Suggested list row shape:

- day/date
- character
- truncated preview
- token count or size hint later if useful

Short-term memory also needs a per-character filter.

## 7. Rebuild From History

One important feature for short-term memory is:

- `Rebuild from history`

This should let the user take the existing chat history for the selected character and generate summary blocks grouped by day.

Why this matters:

- users should not have to "start over" to benefit from memory
- it lets existing conversations become useful short-term context immediately
- it makes the feature adoptable on top of the current system

The first rebuild pass can be simple:

- group conversations by day
- generate one summary block per day
- use the configured token budget as a target hint

For MVP, rebuild should operate on:

- the selected character's chat history

not on journal entries.

## 8. Character Scope

This feature must be per character.

That means:

- rebuilding runs against the selected character's history
- generated summary blocks are stored under that character
- prompt injection only loads blocks for the active character

## 9. MVP Recommendation

Short-term memory should come after long-term memory, but when it arrives the MVP should be:

- daily per-character summary blocks
- configurable window size
- configurable token budget per day
- summaries derived from chat history first
- context injection for the active character
- rebuild-from-history action

Not in MVP:

- journal-only summaries
- hybrid chat + journal summaries

That is enough to make it useful without turning it into a full-blown memory platform on day one.

## 9A. Current Implemented Shape

The current implementation does this now:

- loads the selected character's chat history
- groups messages by local calendar day
- summarizes one day at a time through the active LLM stack
- stores each finished block immediately
- injects recent blocks into new/reset sessions for the active character
- opportunistically generates one automatic block for yesterday on the first eligible run for the active character

Important current limitation:

- `token budget per day` is still a summarization target hint, not a guaranteed provider-level token cap

## 10. Future Compaction Use

Short-term memory blocks are also a strong future fallback for prompt compaction.

If a provider/model hits context-limit failures or requires session compaction later, the app should be able to:

- preserve the latest short-term blocks for the active character
- drop or compress older raw history
- inject the short-term blocks back into the rebuilt system context

That gives AIRI a continuity-preserving fallback instead of losing the entire recent thread.

This is not part of the MVP, but the current short-term memory shape should be treated as compatible with that future use.
