# Project AIRI Agent Guide

This file gives the core rules for all work in the `moeru-ai/airi` monorepo. Skills and nested `AGENTS.md` files give the rules for specific tasks. Before you start a task, find it in [Task Routing](#task-routing) and read the listed file.

## Project Map

All apps use Vue 3, Vite, TypeScript, Pinia, VueUse, UnoCSS, Vitest, and ESLint.

| Path | Content |
| --- | --- |
| `apps/stage-web` | The web app. It uses Vue Router. |
| `apps/stage-tamagotchi` | The Electron desktop app. |
| `apps/stage-pocket` | The mobile app. It uses Vue Router, Capacitor, Kotlin, and Swift. |
| `packages/stage-ui` | Business components, composables, and stores that stage-web and stage-tamagotchi share. |
| `packages/stage-ui-three` | Three.js bindings and Vue components. |
| `packages/stage-shared` | Logic that the stage packages and the stage apps share. |
| `packages/stage-pages` | Shared page bases. |
| `packages/stage-layouts` | Shared layouts, including the stage-web settings layout. |
| `packages/ui` | Primitives built on reka-ui, such as inputs, buttons, and layout. They have minimal business logic. |
| `packages/i18n` | All translations. |
| `packages/server-runtime`, `packages/server-sdk`, `packages/server-shared` | The server channel that `services/` and `plugins/` use. |
| `server/apps/api` | The hosted Hono resource API and its business domains. |
| `server/apps/auth` | The standalone Better Auth and OIDC service. |
| `server/packages` | Backend-only schema and Node infrastructure packages. |
| `server/dev/caddy` | Local Auth and API edge routing. |
| `server/docker-compose.yaml` | The complete local backend stack. |

Key files and directories:

- Pages are in `apps/stage-web/src/pages` and `apps/stage-tamagotchi/src/renderer/pages`. Devtools pages are in the `devtools` folder of each.
- The router configuration is in `apps/stage-web/vite.config.ts` and `apps/stage-tamagotchi/electron.vite.config.ts`.
- The settings layouts are `packages/stage-layouts/src/layouts/settings.vue` (stage-web) and `apps/stage-tamagotchi/src/renderer/layouts/settings.vue`.
- A settings or devtools page needs `<route lang="yaml"> meta: layout: settings </route>`. Register its route and icon in the settings layout.
- In `packages/stage-ui/src`, provider definitions are in `stores/providers/` and orchestration modules are in `stores/modules/`.
- Business composables are in `packages/stage-ui/src/composables/`. Business components are in `packages/stage-ui/src/components/`.
- Put a component for one page or one use case in `packages/stage-ui/src/components/scenarios/`.
- Stories are in `packages/stage-ui/stories`, with `packages/stage-ui/histoire.config.ts`. An example is `packages/stage-ui/src/components/misc/Button.story.vue`.
- Eventa contracts are in `apps/stage-tamagotchi/src/shared`. Main and renderer usage examples are in `apps/stage-tamagotchi/src/main/services/electron`.
- The dependency injection example is `apps/stage-tamagotchi/src/main/index.ts`.
- Style configuration is in `uno.config.ts`. Existing animations are in `apps/stage-web/src/styles`.
- CI pipelines are in `.github/workflows`. Lint rules are in `eslint.config.ts`.

## Commands

Use pnpm workspace filters to limit a command to one workspace. Replace `<package name>` with the `name` field in `package.json`, for example `@proj-airi/stage-tamagotchi`.

- Typecheck one workspace: `pnpm -F <package name> typecheck`. For stage-tamagotchi, this command runs `tsc` and `vue-tsc`.
- Test one file: `pnpm exec vitest run <path>`.
- Test one workspace: `pnpm -F <package name> exec vitest run`.
- Test all projects: `pnpm test:run`. If Vitest finds no tests, examine the `include` patterns in `vitest.config.ts`.
- Lint: `pnpm lint`. ESLint also does the formatting. To fix lint and format errors, run `pnpm lint:fix`.
- Build one workspace: `pnpm -F <package name> build`. For stage-tamagotchi, this command runs the typecheck and `electron-vite build`.

## Scope and Checks

- Keep each change inside the scope of the task.
- In each function, component, or test that you change, correct the code that does not obey a current rule. Do not change other code only to improve it.
- Do not add one-off patterns. Before you write a new utility or function, search for an existing internal implementation.
- If new logic can become a shared utility, propose the shared approach to the user.
- If a refactor is small, do it step by step.
- After a task, run the typecheck and the related tests for each workspace that you changed.
- If you change a shared package or an exported type, also run the root `pnpm typecheck`.
- Run `pnpm lint` before you finish.
- Report only the checks that you ran. Give each command and its result.
- At the end, summarize the changes, the commands that you ran, and the follow-up work.

## Code Rules

- Put shared logic in `packages/`. Keep module boundaries clear.
- Use kebab-case for all file names.
- Do not use `any`. Prefer type generics. Use `as unknown as <Type>` only when you cannot fix the type safely.
- Omit TypeScript and JavaScript source extensions in relative imports, dynamic imports, and re-exports. Write `./module`, not `./module.ts` or `./module.js`. Keep an extension only when the runtime or asset format requires it.
- Do not edit `tsconfig.json` to hide an import or type error. Find and fix the cause.
- Treat a circular import as a design problem. First reconsider ownership and module boundaries. If you cannot resolve the cycle confidently, ask the user.
- Use `@moeru/eventa` for all IPC, RPC, and cross-process events. Define the contracts in one central place, such as `apps/stage-tamagotchi/src/shared`.
- Use dependency injection only at external boundaries: databases, model runtimes, queues, caches, filesystems, networks, clocks, environments, and feature gates. Use `injeca` for it.
- Do not add dependency objects for internal functions that only call sibling helpers or forward parameters.
- Prefer classes for runtime or browser APIs. Also prefer classes for substantial business modules that own state, lifecycle, or a stable domain boundary.
- Prefer functions for pure transformations and local helpers.
- Use Valibot for schema validation. Keep each schema near its consumers.
- Use `errorMessageFrom(error)` from `@moeru/std` to get an error message. Add `?? 'fallback'` when you need a default. For other error handling, prefer the `@moeru/std` patterns.
- Mark every workaround with a `// NOTICE:` comment in this format:

  ```ts
  // NOTICE:
  // Why this workaround is needed.
  // Root cause summary.
  // Source/context (file, issue, URL, or node_modules reference).
  // Removal condition (when it can be safely deleted).
  ```

### Backward Compatibility

- Do not add backward-compatibility guards.
- If old callers or old data need extended support, write a refactor document with the target shape. Then start another Codex or Claude Code session from the shell to do the refactor.
- If a compatibility fallback must stay for a limited time, mark it with `// NOTICE:` and give its removal condition.
- If a compatibility fallback is permanent, document it as supported policy. Do not call it legacy.
- A nested `AGENTS.md` can override this rule for a public contract. It must name the root rule that it overrides.

### Dependencies

- Prefer `es-toolkit` for general utilities. Ask the user before you add another general utility library, such as a package from `unjs` or `tinylib`.
- Some features use `node:*` built-in modules, DOM operations, Vue composables, React hooks, Vite plugins, or GitHub Actions workflows. For these features, research existing libraries first.
- Before you choose a library, ask the user to choose. Help the user compare the options.
- If the user works spec-driven, list the candidate libraries in a Markdown comparison table.
- If the user asks you to use a specific tool or dependency, read its documentation in Context7 first. Then examine how this repository uses it.
- If Context7 returns several names without a clear difference, ask the user to choose one.
- If the documentation conflicts with the typecheck result, examine the dependency source in `node_modules` to find the cause.

## Documentation

- Put project-wide and client ADRs in `docs/ai/adr/`. Put hosted backend ADRs in `server/docs/ai/adr/`, and obey the ADR rules in `server/AGENTS.md`.
- Put a documentation change in the same commit or PR as the code that it describes. This rule applies to ADRs, `README.md` files, and component references.
- Put agent configuration changes in a separate commit or PR. Agent configuration includes `AGENTS.md`, `CLAUDE.md`, skills, and `.github/copilot-instructions.md`.
- Keep a structured `README.md` in each `packages/` and `apps/` entry. It tells what the entry does, how to use it, when to use it, and when not to use it.
- Put all translations in `packages/i18n`. By default, edit only the English source locale and your own locale.
- Do not edit other locales unless the user asks. Crowdin manages them, and the next Crowdin sync can replace local edits.
- When you add a nested `AGENTS.md`, add a `CLAUDE.md` next to it that contains only `@AGENTS.md`. The root `CLAUDE.md` stops Claude Code from reading a nested `AGENTS.md` without this file.

## Writing

- For text, obey the [`simple-english`](.agents/skills/simple-english/SKILL.md) skill. Text includes documentation, code comments, commit messages, and PR and issue text.
- Do not apply the skill to code, identifiers, commands, or quoted errors.
- This repository breaks these rules most often:
  - Do not write "should", "may", "might", "could", or "would". Write "must" or "can", or state the fact.
  - Do not use semicolons. Write two sentences.
  - Write "for example" and "that is". Do not write "e.g.", "i.e.", or "etc.".
  - Write an instruction in 20 words or fewer. Write a description in 25 words or fewer.
  - Put a condition before its command.

## Git and Pull Requests

- Use Conventional Commits, for example `feat(<package name>): add runner reconnect backoff`. Do not use gitmoji.
- Name branches `username/feat/short-name`.
- Rebase when you pull.
- To create, open, publish, or prepare a pull request, use the [`create-pr`](.agents/skills/create-pr/SKILL.md) skill. It also covers visual evidence and review follow-up.

## Task Routing

Skills are in `.agents/skills/<name>/SKILL.md`. Read the listed file before you start the task.

| Task | Read |
| --- | --- |
| Write, refactor, or review TypeScript or Vue code | [`enforce-rules-for-typescript`](.agents/skills/enforce-rules-for-typescript/SKILL.md) |
| Write or debug tests, reproduce a bug, add mocks, or fix test import boundaries | [`enforce-rules-for-vitest`](.agents/skills/enforce-rules-for-vitest/SKILL.md) |
| Change UnoCSS, Vue styles, UI components, animations, icons, or color mode | [`enforce-rules-for-unocss`](.agents/skills/enforce-rules-for-unocss/SKILL.md) |
| Add `synced` to a Pinia store, or change a synced store | [`enforce-rules-for-pinia-synced`](.agents/skills/enforce-rules-for-pinia-synced/SKILL.md) |
| Write or change a string that users see, or a glossary term | [`packages/i18n/AGENTS.md`](packages/i18n/AGENTS.md) |
| Work under `server/` | [`server/AGENTS.md`](server/AGENTS.md). For `server/apps/api`, also read [`server/apps/api/AGENTS.md`](server/apps/api/AGENTS.md). |
| Write documentation, code comments, commit messages, or PR and issue text | [`simple-english`](.agents/skills/simple-english/SKILL.md) |
| Create or prepare a pull request | [`create-pr`](.agents/skills/create-pr/SKILL.md) |
| Upload a local file through a file input or a file chooser in a web or Electron app | [`use-agent-browser-with-input-file`](.agents/skills/use-agent-browser-with-input-file/SKILL.md) and [`agent-browser`](.agents/skills/agent-browser/SKILL.md). For Electron, also read [`agent-browser-electron`](.agents/skills/agent-browser-electron/SKILL.md). |
| Test Live2D, VRM, or MMD import and rendering in stage-web, stage-tamagotchi, or stage-pocket | [`use-agent-browser-for-airi`](.agents/skills/use-agent-browser-for-airi/SKILL.md) |

These directories also have their own `AGENTS.md`. Read it before you work in the directory:

- `packages/model-driver-mediapipe/`
- `services/computer-use-mcp/`
