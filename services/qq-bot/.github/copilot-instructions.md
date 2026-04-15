# Copilot instructions for `services/qq-bot`

## Build, test, and lint commands

Run commands from repo root (`airi`) unless noted.

- Install workspace deps: `pnpm install`
- Run this service once: `pnpm -F @proj-airi/qq-bot start`
- Run this service in watch mode: `pnpm -F @proj-airi/qq-bot dev`
- Typecheck this service: `pnpm -F @proj-airi/qq-bot typecheck`

Repository-level commands (used when validating broader impact):

- Lint all workspaces: `pnpm lint`
- Auto-fix lint/format: `pnpm lint:fix`
- Run all tests: `pnpm test:run`

Single test command pattern:

- `pnpm exec vitest run <path/to/test-file>`
- Example: `pnpm exec vitest run services/qq-bot/src/some-feature.test.ts`

## High-level architecture

This package is a QQ OneBot adapter scaffold built around NapLink and a staged message pipeline.

- `src/config.ts` is the configuration center:
  - defines `BotConfigSchema` with Valibot,
  - exports all config types via `v.InferOutput`,
  - loads YAML and applies env fallback for LLM fields (`LLM_API_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`).
- `src/client.ts` is the runtime composition root:
  - builds `NapLink` client,
  - wires `Dispatcher -> PipelineRunner`,
  - normalizes incoming `message.group` / `message.private` events,
  - runs graceful shutdown (`SIGINT` / `SIGTERM`).
- `src/types/*` defines protocol-safe internal contracts:
  - `event.ts`: normalized `QQMessageEvent` and `sessionId` format (`qq:{type}:{id}`),
  - `context.ts`: pipeline blackboard (`PipelineContext`) and `StageResult`,
  - `message.ts`: typed message segments with input/output separation,
  - `response.ts`: discriminated union payloads + fail-fast factory helpers.
- `src/pipeline/stage.ts` defines the stage base contract and timing/error wrapper.
- `src/pipeline/extensions.ts` reserves a strongly-typed cross-stage extension area.
- `src/utils/logger.ts` + `src/utils/naplink-logger-adapter.ts` provide unified logging and NapLink logger bridging.

Design reference for the intended 7-stage pipeline (`Filter -> Wake -> RateLimit -> Session -> Process -> Decorate -> Respond`) is in:

- `Project AIRI — QQ OneBot 适配器设计文档 ... .md`

Current repository status to keep in mind while coding:

- `src/index.ts` is currently empty.
- `src/client.ts` imports `./dispatcher`, `./normalizer`, and `./pipeline/runner`, but those modules are not present yet.

## Key conventions in this codebase

- Keep config as a single source of truth in Valibot schemas; derive TS types from schemas instead of parallel interfaces.
- Use explicit discriminated unions (`kind`, `action`, `type`) for pipeline flow and payloads; avoid loosely typed records.
- Preserve the input/output message segment split:
  - input may contain `reply` segments,
  - output payloads must not contain `reply`; use `replyTo` and let dispatch layer inject reply segments.
- Use `PipelineContext` as the shared stage blackboard; cross-stage extra data belongs in `context.extensions` with typed fields, not ad-hoc metadata.
- Follow fail-fast helpers in `src/types/response.ts` (throw on invalid empty payloads) instead of silent fallbacks.
- Keep session identity format consistent: `qq:{sourceType}:{groupId|userId}`.
- Prefer factory-based assembly for runtime wiring (`createBot`, `createDispatcher`, normalizers, runner) and keep orchestration in composition roots.
- Route all logs through `createLogger(...)`/`initLoggers(...)`; do not introduce standalone logging patterns.
- Use `pnpm` workspace filters (`pnpm -F ...`) for service-scoped runs in this monorepo.
