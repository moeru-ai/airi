# Tasks: Plaintext Response Format

## Part A: Prompt Engineering

- [x] A1: Add the English "NEVER use Markdown" instruction paragraph to `packages/i18n/src/locales/en/base.yaml`
- [x] A2: Add the Japanese "NEVER use Markdown" instruction paragraph to `packages/i18n/src/locales/ja/base.yaml`
- [x] A3: Add the English instruction paragraph to `packages/i18n/src/locales/zh-Hans/base.yaml`
- [x] A4: Add the English instruction paragraph to `packages/i18n/src/locales/zh-Hant/base.yaml`
- [x] A5: Add the English instruction paragraph to `packages/i18n/src/locales/ko/base.yaml`
- [x] A6: Add the English instruction paragraph to `packages/i18n/src/locales/es/base.yaml`
- [x] A7: Add the English instruction paragraph to `packages/i18n/src/locales/fr/base.yaml`
- [x] A8: Add the English instruction paragraph to `packages/i18n/src/locales/ru/base.yaml`
- [x] A9: Add the English instruction paragraph to `packages/i18n/src/locales/vi/base.yaml`

## Part B: Post-processing Markdown Stripper

- [x] B1: Create `packages/core-agent/src/runtime/markdown-stripper.ts`
- [x] B2: Create `packages/core-agent/src/runtime/markdown-stripper.test.ts`
- [x] B3: Export `stripMarkdownFromSpeech` from `packages/core-agent/src/index.ts`
- [x] B4: Integrate into streaming path in `chat-orchestrator-runtime.ts`
- [x] B5: Integrate into final categorization path in `chat-orchestrator-runtime.ts`

## Verification

- [x] V1: Run `pnpm -F @proj-airi/core-agent typecheck` — passed
- [x] V2: Run `pnpm -F @proj-airi/core-agent exec vitest run` — 101 tests passed
- [x] V3: Run `pnpm format:check` — all files formatted correctly
