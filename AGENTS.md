# Project AIRI Agent Guide

Concise but detailed reference for contributors working across the `moeru-ai/airi` monorepo. Improve code when you touch it; avoid one-off patterns.

## Tech Stack (by surface)

- **Desktop (stage-tamagotchi)**: Electron, Vue, Vite, TypeScript, Pinia, VueUse, Eventa (IPC/RPC), UnoCSS, Vitest, ESLint.
- **Web (stage-web)**: Vue 3 + Vue Router, Vite, TypeScript, Pinia, VueUse, UnoCSS, Vitest, ESLint. Backend: WIP.
- **Mobile (stage-pocket)**: Vue 3 + Vue Router, Vite, TypeScript, Pinia, VueUse, UnoCSS, Vitest, ESLint, Kotlin, Swift, Capacitor.
- **UI/Shared Packages**:
  - `packages/stage-ui`: Core business components, composables, stores shared by stage-web & stage-tamagotchi (heart of stage work).
  - `packages/stage-ui-three`: Three.js bindings + Vue components.
  - `packages/stage-ui-pixi`: Planned Pixi bindings.
  - `packages/stage-shared`: Shared logic across stage-ui, stage-ui-three, stage-web, stage-tamagotchi.
  - `packages/ui`: Standardized primitives (inputs, textarea, buttons, layout) built on reka-ui; minimal business logic.
  - `packages/i18n`: Central translations.
  - Server channel: `packages/server-runtime`, `packages/server-sdk`, `packages/server-shared` (power `services/` and `plugins/`).
  - Legacy: `crates/` (old Tauri desktop; current desktop is Electron).

## Structure & Responsibilities

- **Hosted backend** (`server/`)
  - `server/apps/api`: Hono resource API and business domains.
  - `server/apps/auth`: standalone Better Auth and OIDC service.
  - `server/packages`: backend-private schema and Node infrastructure packages.
  - `server/dev/caddy`: local-only Auth/API edge routing.
  - `server/docker-compose.yaml`: complete local backend stack.
- **Apps**
  - `apps/stage-web`: Web app; composables/stores in `src/composables`, `src/stores`; pages in `src/pages`; devtools in `src/pages/devtools`; router config via `vite.config.ts`.
  - `apps/stage-tamagotchi`: Electron app; renderer pages in `src/renderer/pages`; devtools in `src/renderer/pages/devtools`; settings layout at `src/renderer/layouts/settings.vue`; router config via `electron.vite.config.ts`.
  - Settings/devtools routes rely on `<route lang="yaml"> meta: layout: settings </route>`; ensure routes/icons are registered accordingly (`apps/stage-tamagotchi/src/renderer/layouts/settings.vue`, `apps/stage-web/src/layouts/settings.vue`).
  - Shared page bases: `packages/stage-pages`.
  - Stage pages: `apps/stage-web/src/pages`, `apps/stage-tamagotchi/src/renderer/pages` (plus devtools folders).
- **Stage UI internals** (`packages/stage-ui/src`)
  - Providers: `stores/providers.ts` and `stores/providers/` (standardized provider definitions).
  - Modules: `stores/modules/` (AIRI orchestration building blocks).
  - Composables: `composables/` (business-oriented Vue helpers).
  - Components: `components/`; scenarios in `components/scenarios/` for page/use-case-specific pieces.
  - Stories: `packages/stage-ui/stories`, `packages/stage-ui/histoire.config.ts` (e.g. `components/misc/Button.story.vue`).
- **IPC/Eventa**: Always use `@moeru/eventa` for type-safe, framework/runtime-agnostic IPC/RPC. Define contracts centrally (e.g., `apps/stage-tamagotchi/src/shared`) and follow usage patterns in `apps/stage-tamagotchi/src/main/services/electron` for main/renderer integration.
- **Dependency Injection**: Use `injeca` for services/electron modules/plugins/frontend; see `apps/stage-tamagotchi/src/main/index.ts` for composition patterns.
- **Build/CI/Lint**: `.github/workflows` for pipelines; `eslint.config.js` for lint rules.
- **Styles**: UnoCSS config at `uno.config.ts`; check `apps/stage-web/src/styles` for existing animations; prefer UnoCSS over Tailwind.

## Key Path Index (what lives where)

- `packages/stage-ui`: Core stage business components/composables/stores.
  - `src/stores/providers.ts` and `src/stores/providers/`: provider definitions (standardized).
  - `src/stores/modules/`: AIRI orchestration modules.
  - `src/composables/`: reusable Vue composables (business-oriented).
  - `src/components/`: business components; `src/components/scenarios/` for page/use-case-specific pieces.
  - Stories: `packages/stage-ui/stories`, `packages/stage-ui/histoire.config.ts` (e.g. `components/misc/Button.story.vue`).
- `packages/stage-ui-three`: Three.js bindings + Vue components.
- `packages/stage-ui-pixi`: Planned Pixi bindings.
- `packages/stage-shared`: Shared logic across stage-ui, stage-ui-three, stage-web, stage-tamagotchi.
- `packages/ui`: Standardized primitives (inputs/textarea/buttons/layout) built on reka-ui.
- `packages/i18n`: All translations.
- Hosted backend: `server/apps/api`, `server/apps/auth`, `server/packages`, and local tooling under `server/dev`.
- Server channel: `packages/server-runtime`, `packages/server-sdk`, `packages/server-shared` (power `services/` and `plugins/`).
- Legacy desktop: `crates/` (old Tauri; Electron is current).
- Pages: `packages/stage-pages` (shared bases); `apps/stage-web/src/pages` and `apps/stage-tamagotchi/src/renderer/pages` for app-specific pages; devtools live in each app’s `.../pages/devtools`.
- Router configs: `apps/stage-web/vite.config.ts`, `apps/stage-tamagotchi/electron.vite.config.ts`.
- Devtools/layouts: `apps/stage-tamagotchi/src/renderer/layouts/settings.vue`, `apps/stage-web/src/layouts/settings.vue`.
- IPC/Eventa contracts/examples: `apps/stage-tamagotchi/src/shared`, `apps/stage-tamagotchi/src/main/services/electron`.
- DI examples: `apps/stage-tamagotchi/src/main/index.ts` (injeca).
- Styles: `uno.config.ts` (UnoCSS), `apps/stage-web/src/styles` (animations/reference).
- Build pipeline refs: `.github/workflows`; lint rules in `eslint.config.js`.
- Documented solutions: `docs/solutions/` records past fixes and workflow learnings, organized by category with YAML frontmatter (`module`, `tags`, `problem_type`); relevant when implementing, debugging, or verifying in documented areas.
- Tailwind/UnoCSS: prefer UnoCSS; if standardizing styles, add shortcuts/rules/plugins in `uno.config.ts`.

## Commands (pnpm with filters)

> Use pnpm workspace filters to scope tasks. Examples below are generic; replace the filter with the target workspace name (e.g. `@proj-airi/stage-tamagotchi`, `@proj-airi/stage-web`, `@proj-airi/stage-ui`, etc.).

- **Typecheck**
  - `pnpm -F <package.json name> typecheck`
  - Example: `pnpm -F @proj-airi/stage-tamagotchi typecheck` (runs `tsc` + `vue-tsc`).
- **Unit tests (Vitest)**
  - Targeted: `pnpm exec vitest run <path/to/file>`
    e.g. `pnpm exec vitest run apps/stage-tamagotchi/src/renderer/stores/tools/builtin/widgets.test.ts`
  - Workspace: `pnpm -F <package.json name> exec vitest run`
    e.g. `pnpm -F @proj-airi/stage-tamagotchi exec vitest run`
  - Root `pnpm test:run`: runs all tests across registered projects. If no tests are found, check `vitest.config.ts` include patterns.
  - Root `vitest.config.ts` includes `apps/stage-tamagotchi` and other projects; each app/package can have its own `vitest.config`.
- **Lint**
  - `pnpm lint` and `pnpm lint:fix`
  - Formatting is handled via ESLint; `pnpm lint:fix` applies formatting.
- **Build**
  - `pnpm -F <package.json name> build`
  - Example: `pnpm -F @proj-airi/stage-tamagotchi build` (typecheck + electron-vite build).

## Before You Start

## Enforced Repository Skills

- For testing, Vitest, regression reproduction, mocks, or test import-boundary work, always use [`enforce-rules-for-vitest` skill](.agents/skills/enforce-rules-for-vitest/SKILL.md).
- For UnoCSS, Vue styling, UI components, animations, icons, or color-mode work, always use [`enforce-rules-for-unocss` skill](.agents/skills/enforce-rules-for-unocss/SKILL.md).
- For web or Electron workflows that upload a local file through an HTML input, a dynamically created input, or a file chooser, invoke [`$use-agent-browser-with-input-file`](.agents/skills/use-agent-browser-with-input-file/SKILL.md). Also invoke `$agent-browser`, and invoke `$agent-browser-electron` when the target is Electron.
- For AIRI Live2D, VRM, or MMD import and rendering tests across stage-web, stage-tamagotchi, or stage-pocket, invoke [`$use-agent-browser-for-airi`](.agents/skills/use-agent-browser-for-airi/SKILL.md). It invokes `$use-agent-browser-with-input-file` for the upload mechanism and adds AIRI-specific routes, state preparation, format behavior, and renderer verification.
- For editing, writing, refactoring, re-writing code, submitting issues, Pull Requests, and docs, comments, invoke [`$simple-english`](./agents/skills/simple-english/SKILL.md).

## Development Practices

- Favor clear module boundaries; shared logic goes in `packages/`.
- Keep runtime entrypoints lean; move heavy logic into services/modules.
- Use Valibot for schema validation; keep schemas close to their consumers.
- Use Eventa (`@moeru/eventa`) for structured IPC/RPC contracts where needed.
- Use `errorMessageFrom(error)` from `@moeru/std` to extract error messages instead of manual patterns like `error instanceof Error ? error.message : String(error)`. Pair with `?? 'fallback'` when a default is needed.
- Do not add backward-compatibility guards. If extended support is required, write refactor docs and spin up another Codex or Claude Code instance via shell command to complete the implementation with clear instructions and the expected post-refactor shape.
- If the refactor scope is small, do a progressive refactor step by step.
- For new feature requirements or requirement-related tasks involving `node:*` built-in modules, DOM operations, Vue composables, React hooks, Vite plugins, or GitHub Actions workflows, always do deep research for suitable existing libraries or open source modules first. Before choosing any library, always ask the user to choose and help judge which option is right. Never choose generalized utility libraries on your own (for example, `es-toolkit`, utilities from `github.com/unjs`, or tiny tools from `github.com/tinylib`) without explicit user confirmation. If the user is working spec-driven, list candidate choices in a clear and concise Markdown comparison table.

## TypeScript / IPC / Tools

- Keep JSON Schemas provider-compliant (explicit `type: object`, required fields; avoid unbounded records).
- For Electron, and backend related packages, use `injeca` for dependency management; avoid new class hierarchies unless extending browser APIs (classes are harder to mock/test).
- Centralize Eventa contracts; use `@moeru/eventa` for all events.
- Import types from the module or package that owns the contract. Do not redeclare external/public contracts locally just to use a narrower subset, and do not route type imports through local runtime assembly modules when the original side-effect-free type source is available.
- Omit TypeScript and JavaScript source extensions from relative imports, dynamic imports, and re-exports. Write `./module` instead of `./module.ts` or `./module.js`; keep extensions only when the runtime or asset format requires them.
- Do not directly modify or override `tsconfig.json` to make an import/type error disappear. First investigate compilation behavior, `package.json` `exports` declarations, type declarations, and whether the dependency exposes the intended browser/node entrypoints.
- When Node-only and browser-only types are mixed through one import chain, split the type declarations into a neutral type file and keep runtime modules environment-specific. Avoid importing values from modules that carry side effects just to obtain types.
- If a wrong export or missing export causes an error, trace the full import chain and side-effect chain before changing imports at the leaf. Prefer fixing package/module exports and the owning boundary over adding local workaround imports.
- Treat circular imports as a design problem. If a cycle appears, first reconsider ownership, module boundaries, and whether shared types or pure helpers need to move. If the cycle cannot be resolved confidently, ask the user for direction before continuing.
- When a user asks to use a specific tool or dependency, first check Context7 docs with the search tool, then inspect actual usage of the dependency in this repo.
- If multiple names are returned from Context7 without a clear distinction, ask the user to choose or confirm the desired one.
- If docs conflict with typecheck results, inspect the dependency source under `node_modules` to diagnose root cause and fix types/bugs.

## i18n

- Add/modify translations in `packages/i18n`; avoid scattering i18n across apps/packages.
- By default, modify only the English source locale and the locale used by the developer working on the change. Other locale files are managed through the Crowdin integration; direct local edits may be replaced by untranslated source content after the next Crowdin upload or sync. Avoid editing other locales unless explicitly requested.

### Glossary

`packages/i18n/glossary/terms.yaml` gives the approved English term for each product concept.
`pnpm -F @proj-airi/i18n glossary:build` writes the TBX file that Crowdin imports. `schema.ts`
documents each field.

- Read `terms.yaml` before you write or change a string that a user sees. Use the term it gives.
- Do not edit `packages/i18n/glossary/translations/`. The next Crowdin download replaces it.
- Take terms from the interface. Search the documentation to confirm a term, not to find one.

**Add a term when it prevents one of two failures:**

- A translator who reads only the source string chooses the wrong word.
- Two translators choose different words, and both words are correct.

**Do not add a term when:**

- It is code. A translated control token, JSON key, file name, or package name breaks the
  application, and the application shows no error.
- It is a common English word with its usual meaning, such as "Speed" or "Volume".
- Its parts each have an entry and it says no more than its parts, such as "VRM model".
- One feature uses it, and only two translators could disagree about it. But keep a rare term if a
  translator can get it wrong: `Tachie` occurs two times and is the strongest entry in the file.

`terms.yaml` holds no rationale, because each field must map to a TBX element. Give the reason in
the pull request.

**Write a definition in one sentence.** Describe the thing, not the word, and put a negative rule in
the `note`. Keep each sentence short and active: translators read them, and most do not read English
as a first language.

## Readability, Naming, and Comments

### Naming

- Use kebab-case for all file names.
- Let module boundaries provide context. Avoid repeating package, product, protocol, or transport names in symbols unless the symbol crosses a boundary where that context would otherwise be lost.
- Name functions after domain operations rather than implementation layers.
- Use nouns for resolved domain concepts and verbs for transformations or side effects.
- If a symbol needs several ownership qualifiers to be understandable, reconsider the module boundary or introduce a clearer domain concept.

### Comments

- Comments should explain information the code cannot express clearly: intent, constraints, ownership, invariants, precedence, lifecycle, ordering, side effects, protocol shape, or non-obvious fallbacks.
- Do not add comments that only restate names, types, or visible operations.
- Place implementation comments next to the branch, calculation, transition, or side effect they explain.
- For calculation-heavy code, explain non-obvious coordinate systems, units, conversions, clamps, rounding, aggregation, and precedence beside the relevant intermediate values or branches.
- Prefer clearer names, types, and structured state over comments that compensate for hidden or encoded concepts.
- Keep accurate comments when moving code and remove comments that no longer describe current behavior.
- Format investigation-heavy comments as short paragraphs. When useful, cover context, observed failure, why the obvious fix is insufficient, the chosen fix, and its removal condition or references.
- Use markers:
  - `// TODO:` for follow-up work.
  - `// REVIEW:` for concerns that need another opinion.
  - `// NOTICE:` for workarounds, magic values, external constraints, and other important non-obvious context.

### Fallbacks and Precedence

- Any fallback chain with more than two sources must make precedence explicit.
- If fallback sources represent different schema versions, compatibility behavior, specificity levels, or user/system overrides, each non-primary branch must explain why that case exists and why it has that priority.
- Avoid nested ternaries for fallback chains when any branch is non-obvious. Use named intermediate variables or `if` / `else if` blocks so comments can live next to the relevant branch.
- Do not use a new object or array as a casual fallback. Expressions such as `value ?? {}`, `value ?? []`, `value || {}`, and `value || []` create a new reference each time.
- Never use an inline object or array fallback in a reactive getter, computed value, watcher source, or Pinia state projection. New references can cause false changes, watcher loops, and state broadcasts.
- If an immutable empty fallback is valid, reuse a stable module-level value. Freeze the value when consumers must not mutate it.
- Use `??` only when `null` and `undefined` mean that a value is missing. Use `||` only when `false`, `0`, and an empty string must also select the fallback.
- Do not keep backward-compatibility fallbacks silently. If a fallback is temporary, mark it with `// NOTICE:` and include the removal condition. If it is permanent, document it as supported policy instead of calling it legacy.
- If a fallback returns an empty string, stale value, cached value, default value, or ignored result in non-trivial domain/protocol code, explain why that fallback is safe at the return or branch site.

### Stateful and Protocol Code

- For code that implements a protocol, state machine, lifecycle, cache, request/response flow, event routing, watcher, session, cookie, or cleanup sequence, document the state model near the implementation.
- Distinguish persisted configuration, discovered filesystem state, runtime-loaded state, cache state, session/cookie state, watcher state, and external side effects in names or nearby comments.
- Methods that look like state transitions, such as `setEnabled`, `load`, `unload`, `dispose`, `start`, `stop`, or `refresh`, should make clear which state they change when that is not obvious from the owning type/module.
- When matching events or responses, explicitly document the correlation keys and isolation rules, such as `requestId`, `sessionId`, `ownerExtensionId`, `bindingId`, route namespace, or source window.
- Event handlers must make ignored events understandable. If an event is ignored because of route mismatch, owner mismatch, stale request id, disposed lifecycle, or wrong source, the reason should be visible in code or captured in a named predicate.
- For request/response flows, define or name the envelope shape close to the producer and consumer.
- Document what happens to pending requests on timeout, close, unload, dispose, and publish failure.
- When cleanup spans multiple owners, keep the ordering visible and explain why the order matters.
- When returning a snapshot, fallback value, stale value, or cached value, document freshness semantics at the return site.
- For watchers, event listeners, and async background work, make ownership and shutdown behavior explicit: what starts and stops the work, whether duplicate starts are allowed, and what happens to in-flight work during unload or dispose.

### Pinia Cross-Window Synchronization

- Treat `pinia-plugin-synced` as snapshot replication and leader-routed RPC. It does not share Vue refs between renderers.
- Add `synced` only to stores that need cross-window ownership. Synchronize the smallest serializable source-of-truth state.
- `state: true` sends a full-store proposal after each local mutation. Keep transient and high-frequency state in an unsynchronized store.
- State, action arguments, and action results must support `structuredClone`.
- Keep computed values, query status, runtime clients, controllers, pending promises, and component state outside synchronized state.
- Remote snapshots run local Vue watchers. Never let a watcher on synchronized state write synchronized state or call a synchronized action.
- Enforce cross-field invariants inside explicit actions before the state commit. Do not repair replicated state with a watcher.
- Every returned function in a setup store is a Pinia action. Use computed values or pure helpers for read-only projections.
- List only leader-owned side-effecting actions under `synced.actions`. These actions must be asynchronous, and callers must await them.
- Unlisted actions run in the caller renderer. Their mutations become full-state proposals when `state: true`.
- Keep synchronization and persistence as separate boundaries. Give persisted synchronized state one explicit persistence owner.
- Do not add bidirectional persistence composables or storage-event listeners to synchronized state. Use explicit persistence commands.
- Set the leadership mode explicitly for every Electron renderer. Utility and minimal windows must use `follower-only`.
- Add a multi-window regression test for synchronization changes. One remote snapshot must not produce another mutation or action.

### Readability Refactors

- Readability-only changes should preserve runtime behavior. If behavior changes, add focused tests and document the contract change explicitly.

## Module Design

- Prefer deep modules over shallow modules. A module should hide a meaningful decision: policy, persistence boundary, protocol/schema contract, scheduling semantics, model prompt contract, domain invariant, or lifecycle concern.
- Do not split code by execution order alone. A module boundary should represent a stable responsibility that can be understood without reading all sibling files.
- Keep cohesive domain flows together until there is proven pressure to split. A 200-400 line cohesive module is preferable to several shallow modules that pass the same context/options through each other.
- Prefer classes for runtime or browser APIs and substantial business modules that own state, lifecycle, or a stable domain boundary. Prefer functions for pure transformations and local helpers.
- Use dependency injection only at external boundaries such as databases, model runtimes, queues, caches, filesystems, networks, clocks, environments, and feature gates. Do not introduce dependency objects for internal functions that only call sibling helpers or forward parameters.
- Before creating a new `createXService` or `XDependencies`, verify that `X` adds policy, validation, state, retry/error handling, IO boundary, or a reusable abstraction. If not, keep it as a private helper or inline it.
- Avoid pass-through services such as `createXService({ yService })` when `X` adds no meaningful policy, validation, state, or abstraction.
- Keep special cases close to the branch they affect. If a helper manipulates encoded keys, ownership, filesystem paths, routes, or protocol-shaped data, make that invariant explicit in its structure, name, or nearby documentation.
- Test through stable public behavior. Do not create new exports, dependency bags, or wrapper services only to make private implementation details mockable.
- Keep reusable domain contracts and rendering/building logic in the package that owns that domain. Runtime entrypoints should wire dependencies and call those boundaries instead of inlining large reusable contracts.

## PR / Workflow Tips

- When asked to create, open, publish, or prepare a pull request, always use the repo-local `create-pr` skill. For user-visible changes it orchestrates `use-vishot` and the matching runtime variant, then uploads before/after screenshots as GitHub user assets in the PR body.
- After you create a pull request, get its review threads, comments, and check status. If a review identifies a confirmed error, fix it, run focused checks, push the update, reply with evidence, and resolve the thread.
- Rebase pulls; branch naming `username/feat/short-name`; clear commit messages (gitmoji is prohibited).
- Summarize changes, how tested (commands), and follow-ups.
- Improve legacy you touch; avoid one-off patterns.
- Keep changes scoped; use workspace filters (`pnpm -F <package> <script>`).
- Maintain structured `README.md` documentation for each `packages/` and `apps/` entry, covering what it does, how to use it, when to use it, and when not to use it.
- Always run `pnpm type-check` and `pnpm lint` after finishing a task.
- Use Conventional Commits for commit messages (e.g., `feat(<package name>): add runner reconnect backoff`).
- Before planning or writing new utilities/functions, always search for existing internal implementations first. If the logic could become shared utilities, proactively propose that shared approach to users and developers.

## TypeScript Coding Regulations

These guidelines apply to all TypeScript code across the monorepo:

- Do not create commits during implementation for this spec.
- For implemented modules, use Vitest whenever possible to verify behavior and passing tests.
- Every workaround must use this `// NOTICE:` format:
  ```ts
  // NOTICE:
  // Why this workaround is needed.
  // Root cause summary.
  // Source/context (file, issue, URL, or node_modules reference).
  // Removal condition (when it can be safely deleted).
  ```
- Prefer type generics wherever possible. Do not use `any`. Only use `as unknown as <target expected type>` when avoiding it is nearly impossible and the type cannot be fixed safely.
- Use JSDoc for public APIs, package-level exports, shared architectural boundaries, and non-trivial exported functions, classes, and types. Document only contract details that the signature cannot express, such as assumptions, side effects, lifecycle, and return guarantees.
- Avoid exporting helper functions only to satisfy tests or documentation rules. Keep implementation helpers private unless production code reuses them.
- Do not add JSDoc to trivial helpers, local projections, or pass-through functions. Avoid fixed section templates that restate names and signatures; prefer precise names and branch-local comments for implementation details.
- For exported test helpers or non-obvious reusable test fixtures, include `@example` when it clarifies intended usage.
- Do not attach JSDoc or `@example` blocks to ordinary `describe`, `it`, or `expect*` calls.
- For exported interfaces and type aliases, keep the top-level JSDoc focused on what the type represents and put detailed semantics on the relevant fields. Document generic parameters with `@param`, and add `@default` to every option that has a default value.
- For runner and CLI entrypoints, `/** ... */` JSDoc is required and must include a clear ASCII call-stack diagram using `{@link ...}` references where applicable. For server orchestrators, add the call-stack diagram only when it clarifies a stable architecture boundary; do not add diagrams to shallow glue code.
- Use this call-stack section format in orchestrator/runner/CLI JSDoc:
  ```ts
  /**
   * ...
   *
   * Call stack:
   *
   * collectEvalEntries (../runner)
   *   -> {@link createRunnerSchedule}
   *     -> {@link createMatrixCombinations}
   *       -> {@link VievalScheduledTask}[]
   */
  ```
- For non-obvious OS, exec, process, argument, networking, file, or directory handling, explain the constraint or purpose near the relevant code.
- Prefer `es-toolkit` first when creating utilities.
- For error handling, prefer `@moeru/std` patterns whenever possible.
- For exported normalizers, shared normalizers, or non-obvious local normalizers that normalize outputs, formats, filenames, or values (excluding config default normalization), add `/** ... */` JSDoc with an `@example` showing representative input and output.
- Use this normalizer documentation format:
  ```ts
  /**
   * Normalizes <target>.
   *
   * @example
   * normalizeTarget('ExampleInput')
   * // => 'example-output'
   */
  ```
- Do not move everything into constants. One-time or two-time constants should remain near usage (typically near the top after imports) with clear `/** ... */` explaining why.
- For configurable options with defaults, prefer `@moeru/std` merge functions and define defaults as documented objects when possible, instead of broad standalone constants.
- For retry, backoff, and limit values, do not use one standalone constant to cover everything.
- Avoid hardcoded Unix/macOS/Windows path literals; prefer path-safe array arguments and cross-platform handling.
- For test cases, do not rely on smoke-only tests. Reproduce bugs/failures before patching, then keep comments explaining root cause and fix rationale.
- Use this root-cause block format in regression tests when relevant:
  ```ts
  // ROOT CAUSE:
  //
  // If XXXX, some XXX case happens.
  // This happens because where line ...
  //
  // <before-patch behavior/code>
  //
  // We fixed this by XXX, XXX, XXX.
  // <after-patch behavior/code>
  ```
- Do not split modules into sections using separators like `========`; use cohesive private helper groups or split into modules only when the new module owns a distinct responsibility. Do not split files merely to reduce nesting, line count, or create test seams.
- Do not overuse table-driven style. In many cases, keep table arrays inline and map directly with `.map(...)`.
- Prefer early returns and keep functions simple. Limit nesting when it improves readability, but do not introduce pass-through helpers or shallow modules solely to reduce indentation.

## Readability Review Checklist

When reviewing complex TypeScript modules, check:

- Are owned state, external side effects, lifecycle transitions, cleanup, and freshness semantics identifiable without tracing several neighboring files?
- Are protocol envelopes, correlation keys, isolation rules, and fallback precedence explicit at their decision points?
- Do module and helper boundaries hide meaningful policy rather than merely forwarding context or obscuring special cases?
- Do comments explain non-obvious decisions beside the relevant code without restating names, types, or visible operations?
