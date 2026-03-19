# Technical Design Document
## Generation Config Tester — Character Settings

**Project:** Character-Based LLM Orchestrator
**Feature:** Per-Character Generation Parameter Testing
**Status:** Draft
**Date:** 2026-03-18

---

## 1. Overview

This feature enables users to discover, test, and validate LLM generation parameters on a **per-character basis** without affecting chat history. It addresses the fragmentation of parameter naming across providers (OpenAI, Anthropic, OpenRouter, etc.) by providing a sandbox for trial-and-error configuration.

The first implementation should be intentionally narrow:

- scope it to **consciousness/chat generation only**
- let users test settings without polluting normal chat state
- stage edits locally in the card dialog and only persist them when the user clicks the dialog's normal **Save** button
- support both a small set of structured, well-understood fields and a raw advanced JSON block for provider/backend-specific tuning

---

## 2. Problem Statement

### 2.1 Parameter Inconsistency
Different providers use different keys for the same concept:

| Concept | OpenAI | Anthropic | OpenRouter | Others |
|---------|--------|-----------|------------|--------|
| Max output | `max_completion_tokens` | `max_tokens` | `max_tokens` | `tokens`, `max_output_tokens` |
| Randomness | `temperature` | `temperature` | `temperature` | `temp` |
| Nucleus sampling | `top_p` | `top_p` | `top_p` | `nucleus` |
| Stop sequences | `stop` | `stop_sequences` | `stop` | `stop_tokens` |

### 2.2 Aggregator Ambiguity
Providers like OpenRouter, Together, and Fireworks are **aggregators** proxying dozens of backends. They may:
- Coalesce params to a common schema
- Proxy params directly to the underlying model
- Ignore unknown keys silently
- Reject unknown keys with 400 errors

**Conclusion:** Maintaining a canonical provider param schema is not feasible. Users must own the discovery process.

### 2.3 Why SillyTavern Presets Matter
SillyTavern-style generation preset JSON files are important precedent here. They often contain a mix of:

- common generation controls like `temperature`, `top_p`, `top_k`, and penalties
- backend-specific sampler controls like `min_p`, `dynatemp`, `xtc_*`, `dry_*`, and `mirostat_*`
- ordering/prioritization metadata for how samplers should be applied

The practical lesson is not that AIRI should clone all of SillyTavern's internals. The lesson is that users already have **known-good tuning profiles** that materially improve model behavior.

In practice, SillyTavern appears to use those preset files as **request-shaping input**:

1. the user selects a preset
2. SillyTavern builds the final outbound request for each turn
3. well-known values are mapped into the backend request shape
4. provider/backend-specific values influence how the request is formed or proxied

So the preset is less "just a static JSON blob" and more "a generation behavior profile that gets applied turn by turn."

This is why AIRI should treat **preset import** as a first-class consideration even if compatibility remains best-effort.

---

## 3. Proposed Solution

### 3.1 Generation Config Tester
A sandbox UI embedded in the **Character Edit Screen** that allows users to:

1. **Build** a generation params object incrementally
2. **Test** it with a custom prompt (one-shot, no history)
3. **Review** the raw response + metrics (tokens, timing)
4. **Save** the working config to the character

### 3.2 First-Scope Boundaries
To keep this grounded, the first pass should explicitly avoid trying to solve everything:

- **In scope**
  - consciousness/chat generation settings only
  - per-character tuning
  - one-shot sandbox testing
  - best-effort import of external preset JSON, especially SillyTavern-style settings
- **Out of scope for v1**
  - speech model tuning
  - tool behavior tuning
  - proactivity-specific tuning
  - full cross-provider parameter normalization
  - exact parity with SillyTavern's sampler stack

### 3.3 Design Principles

| Principle | Rationale |
|-----------|-----------|
| **No chat history impact** | Testing is ephemeral; doesn't pollute conversations |
| **One-shot only** | Multi-turn introduces state complexity; keep it simple |
| **User-provided prompt** | Cannot hardcode test input; user defines the scenario |
| **Payload transparency** | Show exactly what JSON is being sent |
| **Metrics visible** | Tokens + timing for cost estimation |
| **Disclaimer prominent** | Set expectations: trial-and-error is expected |
| **Persist only on dialog save** | Match the AIRI card editor model; test against staged changes, commit only when the card is saved |
| **Best-effort preset compatibility** | Preserve useful external tuning intent without pretending to implement every provider/backend quirk |

---

## 4. UI/UX Specification

### 4.1 Location
**Character Edit Screen → dedicated tuning area/tab (exact placement TBD)**

This should no longer assume the old standalone "Settings" tab exists. The actual placement should be decided alongside the larger AIRI card tab consolidation work.

### 4.2 Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  Provider Behavior Disclaimer                           │
│     Keys that work for one model may be ignored or rejected │
│     by another. Trial and error expected.                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ── Test Prompt ─────────────────────────────────────────   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ [Textarea: "Write a message to test with..."]         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ── Parameters ──────────────────────────────────────────   │
│  [+ Add Parameter] (dropdown + custom entry)                │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ max_tokens        │  500                          │ ✕ │  │
│  │ temperature       │  0.8                          │ ✕ │  │
│  │ top_p             │  0.9                          │ ✕ │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ── Preview Payload ─────────────────────────────────────   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ { "max_tokens": 500, "temperature": 0.8, ... }        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [ 🧪 Run Test ]                                            │
│                                                             │
│  ── Response ────────────────────────────────────────────   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ [Response text appears here]                          │  │
│  │                                                       │  │
│  │ Tokens: 142 | Time: 1.2s                              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [ 💾 Save to Character ]                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Component States

| State | Description |
|-------|-------------|
| **Idle** | Empty prompt, no params, test button disabled |
| **Configuring** | Prompt + at least 1 param added, test button enabled |
| **Loading** | Request in flight, show spinner + "Testing..." |
| **Success** | Response displayed with metrics |
| **Error** | API error shown (e.g., 400 bad request, auth failure) |

---

## 5. Data Structures

### 5.1 Character Config Schema (Extended)

```typescript
interface CharacterConfig {
  id: string
  name: string
  provider: string // e.g., "openai", "anthropic", "openrouter"
  model: string // e.g., "gpt-4", "claude-sonnet-4-20250514"
  generationParams?: {
    known?: {
      max_tokens?: number
      temperature?: number
      top_p?: number
      top_k?: number
      frequency_penalty?: number
      presence_penalty?: number
      stop?: string[]
      seed?: number
    }
    advanced?: Record<string, any> // provider/backend-specific extras
    importedPresetMeta?: {
      source?: 'sillytavern' | 'manual' | 'unknown'
      originalKeys?: string[]
      importedAt?: string
    }
  }
  // ... other character fields
}
```

This split is important:

- `known` supports the small set of fields AIRI can confidently label and edit
- `advanced` preserves the rest of the tuning object without pretending it is universal
- `importedPresetMeta` gives the user and future developers context about where the tuning came from

### 5.2 Test Session State (Ephemeral)

```typescript
interface TestSessionState {
  prompt: string
  params: Array<{ key: string, value: any }>
  payloadPreview: string // JSON string
  response?: string
  metrics?: {
    tokens?: number
    timeMs?: number
  }
  status: 'idle' | 'loading' | 'success' | 'error'
  error?: string
}
```

### 5.3 Common Parameter Suggestions (Dropdown Source)

```typescript
const COMMON_LLM_PARAMS = [
  { key: 'max_tokens', type: 'number', default: 500 },
  { key: 'temperature', type: 'number', default: 0.8, min: 0, max: 2 },
  { key: 'top_p', type: 'number', default: 0.9, min: 0, max: 1 },
  { key: 'top_k', type: 'number', default: 40 },
  { key: 'frequency_penalty', type: 'number', default: 0, min: -2, max: 2 },
  { key: 'presence_penalty', type: 'number', default: 0, min: -2, max: 2 },
  { key: 'stop', type: 'array' },
  { key: 'seed', type: 'number' },
  { key: 'max_completion_tokens', type: 'number', default: 500 },
  { key: 'timeout', type: 'number', default: 30000 },
]
```

### 5.4 Preset Import Model
External preset import should be **best effort**:

1. parse the incoming JSON
2. map any recognized keys into `generationParams.known`
3. copy unrecognized but valid keys into `generationParams.advanced`
4. preserve basic metadata about the import source

This should be explicitly framed as:

- **useful**
- **transparent**
- **not guaranteed to reproduce another app's exact runtime behavior**

---

## 6. Implementation Notes

### 6.1 API Request Flow

```
User clicks "Run Test"
    ↓
Build payload from character.provider + character.model + staged tuning params
    ↓
POST to provider endpoint (same pipeline as normal chat)
    ↓
Capture response + headers (for token usage) + timing
    ↓
Display in sandbox (no history write)
```

Important clarification:

- the sandbox should test against the **staged in-dialog values**, not only already-saved card state
- successful tests should **not** auto-apply or auto-save those settings
- the normal AIRI card **Save** action remains the commit point

### 6.2 Storage

| Data | Storage | Persistence |
|------|---------|-------------|
| Character config | Existing AIRI card persistence | Persistent |
| Test session state | Component state (React) | Ephemeral (resets on nav) |
| Last-used test params | LocalStorage (optional) | Session-level |

### 6.3 Security Considerations

- **No history write:** Ensure test requests are flagged to bypass conversation logging
- **API key safety:** Use existing auth pipeline; no new key exposure
- **Payload sanitization:** Don't allow arbitrary code execution in custom param values

### 6.4 Edge Cases

| Case | Handling |
|------|----------|
| Provider rejects unknown key | Show error message; user removes/adjusts param |
| Provider ignores unknown key | Response succeeds; user infers key was ignored |
| Empty prompt | Disable test button; show validation hint |
| No params added | Allow test (uses character defaults) |
| Timeout | Show error; suggest increasing `timeout` param |
| Imported preset contains many unsupported keys | Preserve them in advanced JSON; warn that compatibility is best-effort |
| Imported preset is tuned for another backend | Keep import possible, but label it as potentially non-portable |

---

## 7. Future Considerations

| Feature | Priority | Notes |
|---------|----------|-------|
| Save multiple param presets per character | Low | "Quick", "Verbose", etc. |
| Export/import param configs | Medium | Includes SillyTavern-style preset import/export pathways |
| Auto-suggest params by provider | Medium | Crowdsourced or heuristic-based |
| Multi-turn test mode | Low | Adds complexity; defer to v2 |
| Token cost estimation | Medium | Show $ estimate based on usage |
| Speech/provider tuning surfaces | Low | Separate concern from chat/consciousness tuning |

---

## 8. Open Questions

1. **Default prompt?** Should we provide a sample prompt template, or leave blank?
2. **Param validation?** Should we validate types client-side (e.g., temp 0-2), or let the API reject?
3. **Persist last test state?** Restore prompt/params if user navigates away and returns?
4. **Character defaults?** If no params are set, does the character use provider defaults or app-wide defaults?
5. **UI placement?** Does this become its own tab, or a major section inside a consolidated character/identity surface?
6. **Preset labeling?** How prominently should imported preset provenance (e.g. "Imported from SillyTavern") be shown to the user?

---

## 9. Acceptance Criteria

- [ ] User can add/remove generation params dynamically
- [ ] User can input custom test prompt
- [ ] Test request does not affect chat history
- [ ] Response displays with token count + timing
- [ ] Payload preview shows exact JSON sent
- [ ] Error states are clearly communicated
- [ ] Working config can be saved to character
- [ ] Disclaimer is visible and prominent
- [ ] External preset JSON can be imported on a best-effort basis
- [ ] Known fields and advanced JSON are both preserved without misleading the user about parity

---

**Next Steps:**
1. Confirm UI mockup with stakeholder (Richard)
2. Implement component structure
3. Integrate with existing provider API pipeline
4. Test across multiple providers (OpenAI, Anthropic, OpenRouter)
