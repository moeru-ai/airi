# Tasks: Unreadable Symbols Stripper

## Implementation

- [x] 1: Create `packages/core-agent/src/runtime/unreadable-symbols-stripper.ts`
  - Define `StripUnreadableSymbolsOptions` interface with all 5 boolean options
  - Define `DEFAULT_OPTIONS` constant
  - Implement `extractStreamingTokens` / `restoreStreamingTokens` helpers with Private Use Area placeholders
  - Implement `stripUnreadableSymbols` function with all 6 passes in order:
    - Pass 1: Delegate to `stripMarkdownFromSpeech`
    - Pass 2: Emoji stripping (Unicode ranges + ZWJ + variation selectors)
    - Pass 3: Decorative Unicode stripping (arrows, box-drawing, shapes, dingbats)
    - Pass 4: Standalone special character stripping
    - Pass 5: Math/operator symbol stripping (with word-boundary protection)
    - Pass 6: Repeated punctuation collapsing
  - Apply streaming token extraction before passes and restoration after

- [x] 2: Create `packages/core-agent/src/runtime/unreadable-symbols-stripper.test.ts`
  - Emoji stripping tests (single, skin tones, ZWJ sequences, flags, keycap, mixed)
  - Decorative Unicode tests (arrows, box-drawing, shapes, dingbats, ©®™)
  - Standalone special char tests (unpaired `*`, `#`, `@`, `|`, `\`, `/`)
  - Math operator tests (standalone removal, preservation within words)
  - Repeated punctuation tests (`!!!`, `???`, `....`, `----`, `~~~`)
  - Streaming control token preservation tests (`<|ACT|>`, `<|DELAY|>`, `<|CALL|>`)
  - Options behavior tests (each option `false` disables its pass)
  - Combined input test (Markdown + emoji + decorative + math + repeated punct)
  - Edge cases (empty string, all symbols, no symbols, very long sequences)
  - Backward compatibility test (`stripMarkdownFromSpeech` unchanged)

- [x] 3: Update `packages/core-agent/src/runtime/chat-orchestrator-runtime.ts`
  - Add import for `stripUnreadableSymbols` from `./unreadable-symbols-stripper`
  - Replace streaming path call: `stripMarkdownFromSpeech` → `stripUnreadableSymbols`
  - Replace final categorization path call: `stripMarkdownFromSpeech` → `stripUnreadableSymbols`

- [x] 4: Update `packages/core-agent/src/index.ts`
  - Add export for `stripUnreadableSymbols` from `./runtime/unreadable-symbols-stripper`
  - Add export for `StripUnreadableSymbolsOptions` type
  - Keep existing `stripMarkdownFromSpeech` export (backward compatibility)

## Verification

- [x] 5: Run `pnpm -F @proj-airi/core-agent typecheck` — passed
- [x] 6: Run `pnpm -F @proj-airi/core-agent exec vitest run` — 164 tests passed (14 test files)
- [x] 7: Format check — no linter available locally, code reviewed and consistent
