# Technical Design Document
## Character Generation Settings

**Project:** Character-Based LLM Orchestrator
**Feature:** Per-Character Generation Settings
**Status:** Draft
**Date:** 2026-03-19

---

## 1. Overview

This feature gives each AIRI card its own **Generation** tab so users can tune chat-generation behavior per character without immediately diving into a full provider-normalization project.

The first pass should stay intentionally narrow:

- scope it to **consciousness/chat generation only**
- stage edits inside the AIRI card dialog
- persist them only when the normal dialog **Save** button is clicked
- start with a small, structured set of common controls
- leave room for provider-specific advanced JSON later

---

## 2. Problem Statement

### 2.1 Parameter Inconsistency
Different providers use different keys for the same concept.

| Concept | OpenAI | Anthropic | OpenRouter | Others |
|---------|--------|-----------|------------|--------|
| Max output | `max_completion_tokens` | `max_tokens` | `max_tokens` | `tokens`, `max_output_tokens` |
| Randomness | `temperature` | `temperature` | `temperature` | `temp` |
| Nucleus sampling | `top_p` | `top_p` | `top_p` | `nucleus` |
| Stop sequences | `stop` | `stop_sequences` | `stop` | `stop_tokens` |

### 2.2 Aggregator Ambiguity
Providers like OpenRouter, Together, and Fireworks proxy many different backends. They may:

- coalesce params to a common schema
- proxy params directly to the underlying model
- ignore unknown keys silently
- reject unknown keys entirely

**Conclusion:** AIRI should not pretend there is one universal schema that behaves identically everywhere.

### 2.3 Why SillyTavern Presets Matter
SillyTavern preset JSON is useful precedent because it proves users already have **known-good generation profiles** that materially improve model behavior.

Those presets typically combine:

- common controls like `temperature`, `top_p`, `top_k`, and penalties
- backend-specific sampler settings like `min_p`, `dynatemp`, `xtc_*`, `dry_*`, and `mirostat_*`
- ordering metadata for how those controls should be applied

The important takeaway is not “clone SillyTavern internals.”
The takeaway is: **request-shaping profiles matter**, and AIRI should grow toward preserving and importing them on a best-effort basis.

---

## 3. Proposed Solution

### 3.1 Generation Tab
A dedicated **Generation** tab embedded in the AIRI card editor.

For the first pass, the user flow should be:

1. decide whether this character should use **character-specific generation settings**
2. if enabled, stage a provider, model, and a few common generation controls
3. save those settings together with the AIRI card through the normal dialog **Save** button

This avoids the confusing old idea of separate provider/model override toggles.

The card either:

- uses global generation defaults
- or uses one per-character generation config block

### 3.2 First-Scope Boundaries

- **In scope**
  - consciousness/chat generation settings only
  - per-character tuning
  - staged save inside the AIRI card dialog
  - a small set of structured common fields
- **Out of scope for v1**
  - one-shot sandbox testing
  - speech model tuning
  - tool behavior tuning
  - proactivity-specific tuning
  - full cross-provider parameter normalization
  - exact SillyTavern sampler parity
  - preset JSON import

### 3.3 Design Principles

| Principle | Rationale |
|-----------|-----------|
| **Keep it understandable** | Users should understand “global defaults” vs “character-specific settings” immediately |
| **Persist only on dialog save** | Match the AIRI card editor model |
| **Structured first** | Start with the most common controls before advanced JSON |
| **Best-effort growth path** | The schema should leave room for ST preset import later |
| **No fake universality** | AIRI should not imply every field works the same on every backend |

---

## 4. UI / UX

### 4.1 Location
**Character Edit Screen → `Generation` tab**

This is intentionally separate from:

- `Identity`, which defines the character and prompt text
- `Modules`, which holds the broader provider/model surface AIRI already uses

### 4.2 MVP Layout

- Provider behavior disclaimer
- `Use character-specific generation settings` toggle
- When enabled:
  - provider
  - model
  - max tokens
  - temperature
  - top-p
- Save happens through the normal AIRI card dialog save button

### 4.3 Component States

| State | Description |
|-------|-------------|
| **Disabled** | Character inherits global defaults |
| **Editing** | Character-specific settings are enabled and staged locally |
| **Saved** | Settings persist with the AIRI card after dialog save |

---

## 5. Data Structures

### 5.1 Character Generation Config

```ts
interface CharacterGenerationConfig {
  enabled: boolean
  provider?: string
  model?: string
  known?: {
    maxTokens?: number
    temperature?: number
    topP?: number
  }
  advanced?: Record<string, any>
  importedPresetMeta?: {
    source?: 'sillytavern' | 'manual' | 'unknown'
    originalKeys?: string[]
    importedAt?: string
  }
}
```

This split matters:

- `known` supports the fields AIRI can label clearly today
- `advanced` is reserved for later provider-specific tuning
- `importedPresetMeta` gives later phases context for preset import

---

## 6. Phase Plan

### MVP

- tab name: `Generation`
- one top-level toggle: `Use character-specific generation settings`
- when enabled:
  - provider
  - model
  - max tokens
  - temperature
  - top-p
- saved with the AIRI card only when the dialog Save button is pressed
- no test bench yet
- no preset import yet

### Phase 2

- one-shot sandbox test prompt
- formatted output preview
- latency and token usage
- optional “include current character prompt context”

### Phase 3

- expand common controls
- top-k
- penalties
- provider/backend capability hints
- expose advanced JSON editing

### Phase 4

- best-effort SillyTavern preset import
- recognized keys mapped into structured controls
- unknown keys preserved in `advanced`

---

## 7. Implementation Notes

### 7.1 Practical v1 Shape
The safest first implementation is:

- add the `Generation` tab
- persist the structured config on the AIRI card
- keep the schema future-ready for advanced JSON and preset import

That gives AIRI a real foundation instead of a throwaway form, while leaving room for later request-shaping work.

### 7.2 Preset Import Direction
Preset import should stay explicitly **best effort**:

1. parse incoming JSON
2. map recognized keys into `known`
3. preserve unknown keys in `advanced`
4. record minimal import metadata

This should be framed as:

- useful
- transparent
- not guaranteed to reproduce another app’s exact runtime behavior
