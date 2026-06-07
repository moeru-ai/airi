# Requirements: Unreadable Symbols Stripper

## Problem Statement

The existing `stripMarkdownFromSpeech` function (from the `plaintext-response-format` spec) handles Markdown syntax removal from TTS input, but LLMs and user-generated content can contain many other categories of symbols that TTS engines struggle with:

- **Emoji and Unicode pictographs** — TTS may read "grinning face with smiling eyes" or produce garbled audio
- **Standalone special characters** — `*`, `#`, `@`, `^`, `~`, `|`, `\`, `/` read literally as "asterisk", "hash", "at sign", etc.
- **Math/operator symbols** — `+`, `=`, `<`, `>`, `%`, `&` read as "plus", "equals", "less than" which sounds unnatural in conversational flow
- **Decorative Unicode** — arrows (`→`, `←`), box-drawing characters (`┌`, `─`, `★`, `♦`), and other ornamental symbols
- **Excessive repeated punctuation** — `!!!`, `???`, `...` (beyond ellipsis), `---` read character-by-character

These symbols cause TTS engines to produce unnatural, robotic, or "demonic" sounds that break conversational immersion.

## Requirements

### R1: New `stripUnreadableSymbols` function

A new function `stripUnreadableSymbols` must be created that extends `stripMarkdownFromSpeech` with additional symbol-stripping passes. It must:

- Call `stripMarkdownFromSpeech` as its first pass (reusing existing Markdown stripping logic)
- Strip remaining unreadable symbols that are not Markdown syntax
- Be a pure function with no side effects or external dependencies

### R2: Configurable stripping options

The function must accept an options object with the following boolean flags, all defaulting to `true` (strip everything by default):

| Option | Default | Description |
| --- | --- | --- |
| `stripEmoji` | `true` | Remove emoji and Unicode pictographic symbols |
| `stripMathOperators` | `true` | Remove standalone math/operator symbols (`+`, `=`, `<`, `>`, `%`, `&`, `^`, `~`) |
| `stripDecorativeUnicode` | `true` | Remove decorative Unicode (arrows, box-drawing, geometric shapes, dingbats) |
| `stripStandaloneSpecialChars` | `true` | Remove standalone `*`, `#`, `@`, `\|`, `\`, `/` that survived Markdown stripping |
| `collapseRepeatedPunctuation` | `true` | Collapse `!!!` → `!`, `???` → `?`, `....` → `…`, `----` → `—` |

When all options are `true` (the default), the function provides maximum TTS safety. Consumers can selectively disable categories if needed.

### R3: Emoji stripping

When `stripEmoji` is `true`, the function must remove:

- Standard emoji (Unicode Emoji ranges: U+1F300–U+1F9FF, U+2600–U+26FF, U+2700–U+27BF)
- Emoji modifiers (skin tones U+1F3FB–U+1F3FF)
- Zero-width joiner sequences (family emoji, profession emoji)
- Variation selectors (U+FE0F)
- Keycap sequences (e.g., `#️⃣`, `*️⃣`)
- Regional indicator flags (🇺🇸, 🇯🇵, etc.)

Emoji that are part of natural text flow should be removed entirely — they have no spoken equivalent.

### R4: Math/operator symbol stripping

When `stripMathOperators` is `true`, the function must remove standalone math/operator symbols that TTS reads literally:

- `+`, `=`, `<`, `>`, `%`, `&`, `^`, `~`, `|`, `\`, `/`
- Only when they appear as standalone tokens (surrounded by whitespace or at string boundaries), NOT when part of a word or number (e.g., `C++`, `A&B`, `3<4` mid-sentence should be preserved if they're part of natural text)

**Important**: This must NOT strip these symbols when they're part of:
- Streaming control tokens (`<|ACT|>`, `<|DELAY|>`, `<|CALL|>`)
- URLs or file paths
- Code that was already handled by the Markdown stripper

### R5: Decorative Unicode stripping

When `stripDecorativeUnicode` is `true`, the function must remove:

- Arrows: `→`, `←`, `↑`, `↓`, `⇒`, `⇐`, etc.
- Box-drawing: `┌`, `─`, `┐`, `│`, `└`, `┘`, etc.
- Geometric shapes: `■`, `□`, `●`, `○`, `◆`, `◇`, `★`, `☆`, etc.
- Dingbats and ornamental symbols: `✿`, `❀`, `♪`, `♫`, `☀`, `☁`, etc.
- Miscellaneous symbols: `©`, `®`, `™`, `§`, `¶`, `†`, `‡`, etc.

### R6: Standalone special character stripping

When `stripStandaloneSpecialChars` is `true`, the function must remove standalone instances of:

- `*`, `#`, `@`, `|`, `\`, `/`, `~`, `^`, `` ` ``

These are characters that may survive Markdown stripping (e.g., unpaired markers, or symbols not in Markdown context) and cause TTS to produce unwanted sounds. Only standalone instances (surrounded by whitespace or at string boundaries) should be removed — not when part of words.

### R7: Repeated punctuation collapsing

When `collapseRepeatedPunctuation` is `true`, the function must:

- Collapse `!!!+` → `!`
- Collapse `???+` → `?`
- Collapse `....+` → `…` (ellipsis character)
- Collapse `----+` → `—` (em dash)
- Collapse `~~~~+` → `~`
- Leave single instances and double instances (`!!`, `??`) as-is (they can be natural in conversation)

### R8: Preserve streaming control tokens

The function must NOT strip or modify streaming control tokens (`<|ACT ...|>`, `<|DELAY ...|>`, `<|CALL ...|>`). These are system-level signals that must pass through untouched.

### R9: Integration into chat orchestrator runtime

The existing calls to `stripMarkdownFromSpeech` in [`packages/core-agent/src/runtime/chat-orchestrator-runtime.ts`](packages/core-agent/src/runtime/chat-orchestrator-runtime.ts) must be replaced with calls to `stripUnreadableSymbols`:

- **Streaming path** (line ~454): Replace `stripMarkdownFromSpeech(categorizer.filterToSpeech(literal, streamPosition))` with `stripUnreadableSymbols(categorizer.filterToSpeech(literal, streamPosition))`
- **Final categorization path** (line ~486): Replace `stripMarkdownFromSpeech(finalCategorization.speech)` with `stripUnreadableSymbols(finalCategorization.speech)`

### R10: Export from core-agent

The new function and its options type must be exported from [`packages/core-agent/src/index.ts`](packages/core-agent/src/index.ts) alongside the existing `stripMarkdownFromSpeech` export.

### R11: Backward compatibility

The existing `stripMarkdownFromSpeech` function must remain available as a public export. It is still useful for consumers that only need Markdown stripping without the additional symbol removal.

## Out of Scope

- Modifying the TTS engine itself or its configuration
- Modifying the `processNarrative` function in `tts-chunker.ts` (that handles narrative action markers, a separate concern)
- Modifying the prompt engineering from the `plaintext-response-format` spec
- Real-time streaming symbol detection (the function operates on text chunks, not character streams)
- Language-specific symbol handling (the function is locale-agnostic)

## Success Criteria

- All emoji, decorative Unicode, standalone special chars, and math operators are stripped from TTS input
- Excessive repeated punctuation is collapsed to single characters
- Streaming control tokens pass through untouched
- The existing `stripMarkdownFromSpeech` function remains available and unchanged
- The new function has unit tests covering each stripping category and edge cases
- `pnpm -F @proj-airi/core-agent typecheck` passes
- `pnpm -F @proj-airi/core-agent exec vitest run` passes
