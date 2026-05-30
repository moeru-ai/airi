# Tasks: Plaintext Response Format

## Part A: Prompt Engineering

- [ ] A1: Add the English "NEVER use Markdown" instruction paragraph to `packages/i18n/src/locales/en/base.yaml` — insert after the "try to be like a normal human" line, before the "Streaming control tokens" line in `prompt.prefix`
- [ ] A2: Add the Japanese "NEVER use Markdown" instruction paragraph to `packages/i18n/src/locales/ja/base.yaml` — insert after the Japanese behavioral guidance line, before the streaming token section in `prompt.prefix`
- [ ] A3: Add the English instruction paragraph to `packages/i18n/src/locales/zh-Hans/base.yaml` — same placement pattern as en
- [ ] A4: Add the English instruction paragraph to `packages/i18n/src/locales/zh-Hant/base.yaml` — same placement pattern as en
- [ ] A5: Add the English instruction paragraph to `packages/i18n/src/locales/ko/base.yaml` — same placement pattern as en
- [ ] A6: Add the English instruction paragraph to `packages/i18n/src/locales/es/base.yaml` — same placement pattern as en
- [ ] A7: Add the English instruction paragraph to `packages/i18n/src/locales/fr/base.yaml` — same placement pattern as en
- [ ] A8: Add the English instruction paragraph to `packages/i18n/src/locales/ru/base.yaml` — same placement pattern as en
- [ ] A9: Add the English instruction paragraph to `packages/i18n/src/locales/vi/base.yaml` — same placement pattern as en

## Part B: Post-processing Markdown Stripper

- [ ] B1: Create `packages/core-agent/src/runtime/markdown-stripper.ts` — implement `stripMarkdownFromSpeech(text: string): string` with all 13 stripping rules from the design doc (bold, italic, strikethrough, links, headings, bullet lists, numbered lists, blockquotes, code fences, inline code, horizontal rules, table pipes)
- [ ] B2: Create `packages/core-agent/src/runtime/markdown-stripper.test.ts` — unit tests covering each stripping rule individually, combined Markdown, streaming control token preservation, edge cases (standalone `*`, `#` not at line start, unclosed markers), empty input, no-Markdown passthrough, nested patterns
- [ ] B3: Export `stripMarkdownFromSpeech` from `packages/core-agent/src/index.ts` alongside existing categorizer exports
- [ ] B4: Integrate `stripMarkdownFromSpeech` into the streaming path in `packages/core-agent/src/runtime/chat-orchestrator-runtime.ts` — wrap `categorizer.filterToSpeech()` result with the stripper
- [ ] B5: Integrate `stripMarkdownFromSpeech` into the final categorization path in `packages/core-agent/src/runtime/chat-orchestrator-runtime.ts` — wrap `finalCategorization.speech` with the stripper

## Verification

- [ ] V1: Run `pnpm -F @proj-airi/core-agent typecheck` — confirm type safety
- [ ] V2: Run `pnpm -F @proj-airi/core-agent exec vitest run` — confirm all tests pass including new markdown-stripper tests
- [ ] V3: Run `pnpm format:check` — confirm all files are formatted correctly
