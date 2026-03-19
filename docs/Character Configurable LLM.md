# Technical Design Document
## Generation Config Tester — Character Settings

**Project:** Character-Based LLM Orchestrator
**Feature:** Per-Character Generation Parameter Testing
**Status:** Draft
**Date:** 2026-03-18

---

## 1. Overview

This feature enables users to discover, test, and validate LLM generation parameters on a **per-character basis** without affecting chat history. It addresses the fragmentation of parameter naming across providers (OpenAI, Anthropic, OpenRouter, etc.) by providing a sandbox for trial-and-error configuration.

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

---

## 3. Proposed Solution

### 3.1 Generation Config Tester
A sandbox UI embedded in the **Character Edit Screen** (settings tab) that allows users to:

1. **Build** a generation params object incrementally
2. **Test** it with a custom prompt (one-shot, no history)
3. **Review** the raw response + metrics (tokens, timing)
4. **Save** the working config to the character

### 3.2 Design Principles

| Principle | Rationale |
|-----------|-----------|
| **No chat history impact** | Testing is ephemeral; doesn't pollute conversations |
| **One-shot only** | Multi-turn introduces state complexity; keep it simple |
| **User-provided prompt** | Cannot hardcode test input; user defines the scenario |
| **Payload transparency** | Show exactly what JSON is being sent |
| **Metrics visible** | Tokens + timing for cost estimation |
| **Disclaimer prominent** | Set expectations: trial-and-error is expected |

---

## 4. UI/UX Specification

### 4.1 Location
**Character Edit Screen → Settings Tab → "Generation Test" Section**

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
  generationParams?: Record<string, any> // e.g., { max_tokens: 500, temp: 0.8 }
  // ... other character fields
}
```

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

---

## 6. Implementation Notes

### 6.1 API Request Flow

```
User clicks "Run Test"
    ↓
Build payload from character.provider + character.model + test params
    ↓
POST to provider endpoint (same pipeline as normal chat)
    ↓
Capture response + headers (for token usage) + timing
    ↓
Display in sandbox (no history write)
```

### 6.2 Storage

| Data | Storage | Persistence |
|------|---------|-------------|
| Character config | IndexedDB / LocalStorage | Persistent |
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

---

## 7. Future Considerations

| Feature | Priority | Notes |
|---------|----------|-------|
| Save multiple param presets per character | Low | "Quick", "Verbose", etc. |
| Export/import param configs | Low | Share configs between characters |
| Auto-suggest params by provider | Medium | Crowdsourced or heuristic-based |
| Multi-turn test mode | Low | Adds complexity; defer to v2 |
| Token cost estimation | Medium | Show $ estimate based on usage |

---

## 8. Open Questions

1. **Default prompt?** Should we provide a sample prompt template, or leave blank?
2. **Param validation?** Should we validate types client-side (e.g., temp 0-2), or let the API reject?
3. **Persist last test state?** Restore prompt/params if user navigates away and returns?
4. **Character defaults?** If no params are set, does the character use provider defaults or app-wide defaults?

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

---

**Next Steps:**
1. Confirm UI mockup with stakeholder (Richard)
2. Implement component structure
3. Integrate with existing provider API pipeline
4. Test across multiple providers (OpenAI, Anthropic, OpenRouter)
