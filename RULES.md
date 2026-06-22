# AnimAIOS / AIRI — Project Rules

Task-specific rules for coding agents. Read §0 when doing code changes; other sections as needed.

## §0: Agent SOP

The plan → delegate → review loop for any code change.

### Step 1: Analyze & Plan

Use jcodemunch to explore before acting:

1. `plan_turn(repo="airi", query="<task>")` — opening move; surfaces target symbols and confidence.
2. `search_symbols` / `get_file_outline` — locate exact symbols involved.
3. `get_blast_radius(symbol="...", depth=2)` — understand downstream impact before planning.
4. `get_call_hierarchy` / `find_references` — map callers and dependents.
5. `get_hotspots` / `find_dead_code` — identify risk areas related to the task.

Break the implementation into the smallest logical incremental steps. Do not rush.

### Step 2: Delegate

Use `spawn_agent` for code modifications when that tool is available. If `spawn_agent` is unavailable in the current environment, proceed directly with the normal editing tools and keep changes scoped. When delegating, every prompt MUST include:

- **Repo identifier**: `"airi"`
- **Symbol IDs**: exact `symbol_ids` the subagent needs to read or modify
- **jcodemunch mandate**: "Use jcodemunch tools for all code lookup. `get_file_outline` before pulling source. `search_symbols` / `get_symbol_source` for targeted retrieval. Batch with `symbol_ids[]` instead of repeated calls. `get_ranked_context(query='...', token_budget=4000)` for task-driven context."
- **Token budget**: specify when using `get_ranked_context` or `get_context_bundle`
- **Full context**: the subagent is stateless and knows nothing from previous turns — include everything it needs

Delegation preamble template:

```
You are working in repo "airi" (indexed via jcodemunch-mcp).
Mandatory: use jcodemunch tools for ALL code lookup. Never read a full file.
- get_file_outline before pulling source
- search_symbols / get_symbol_source for targeted retrieval
- Batch with symbol_ids[] instead of repeated calls
- get_ranked_context(query="...", token_budget=4000) for task-driven context

Target symbols: <list symbol_ids>
Task: <description>
```

Delegate ONE step per `spawn_agent` call (when available). If work can be parallelized (disjoint write scopes), spawn multiple agents concurrently.

### Step 3: Review

After a delegated subagent returns, verify with jcodemunch:

1. `get_blast_radius(symbol="...", include_source=true)` — confirm impact matches expectations.
2. `find_references(identifier="...")` — verify no call site is broken.
3. `get_call_hierarchy(symbol_id="...", direction="callers")` — trace upstream dependents.
4. `get_symbol_source(symbol_id="...", verify=true)` — confirm indexed source matches what was written.
5. `register_edit(file_paths=[...], reindex=true)` — keep the index fresh after edits.
6. Run targeted tests: `pnpm exec vitest run <changed-file>`

If the step passes, proceed to the next. If revision is needed, re-delegate with corrective feedback and fresh full context — the subagent has no memory of the previous attempt. (When working directly without `spawn_agent`, skip this review loop and verify your own edits with jcodemunch before proceeding.)

---

## §1: TypeScript

- Import types from the module that owns the contract. Do not redeclare external types locally for narrower subsets. Do not route type imports through runtime assembly modules when a side-effect-free source exists.
- Do not use inline type imports (`typeof import('...').x`, `import('...').Type`) to bypass module boundaries. Export explicit shared types from the owning module instead.
- Do not modify `tsconfig.json` to make errors disappear. Investigate compilation behavior, `package.json` exports, type declarations, and entrypoints first.
- When Node-only and browser-only types mix through one import chain, split declarations into a neutral type file and keep runtime modules environment-specific.
- If a wrong/missing export causes an error, trace the full import chain and side-effect chain before changing imports at the leaf. Fix package exports and owning boundaries over local workarounds.
- Treat circular imports as a design problem. Reconsider ownership, module boundaries, and whether shared types or pure helpers need to move. Ask for direction if a cycle cannot be resolved confidently.
- Prefer type generics. Avoid `any`. Only use `as unknown as <type>` when avoiding it is nearly impossible and the type cannot be fixed safely.
- Keep JSON Schemas provider-compliant: explicit `type: object`, required fields, avoid unbounded records.
- Favor functional patterns + DI (`injeca`). Avoid new class hierarchies unless extending browser/runtime APIs.
- Centralize Eventa contracts; use `@moeru/eventa` for all events.
- Use `errorMessageFrom(error)` from `@moeru/std` for error extraction. Pair with `?? 'fallback'` when a default is needed.
- Prefer `es-toolkit` when creating utilities. Prefer `@moeru/std` patterns for error handling.
- Do not add backward-compatibility guards. If extended support is needed, write refactor docs and use a separate instance.

## §2: Testing

- Vitest per project; keep runs targeted for speed.
- Reproduce bugs with a test before changing production code. Prefer unit tests; use the smallest higher-level test that reproduces the problem.
- Include tracker identifiers in test names: `Issue #<number>` for GitHub, Linear key for internal.
- Add the report URL as a comment above the regression test (GitHub issue, Discord message, or Linear URL).
- Mock IPC/services with `vi.fn`/`vi.mock`. Do not rely on real Electron runtime.
- For external providers, add both mock-based and integration-style tests (with env guards) when feasible.
- Prefer line-by-line `expect` / assertion statements. Avoid testing impossible runtime states (assertions against constants, object mutations that only happen within the same case).
- Do not mock `globalThis` or built-in modules with `Object.defineProperty`. Prefer `node:worker_threads` for simulation or Vitest browser mode for DOM APIs. Progressively refactor existing hard-mocks.
- Do not use Vitest mocks, hoisting, dynamic imports, `as unknown as`, or test-only import paths to bypass real import problems. Fix the compilation/runtime boundary instead of hiding the failure in the test.
- Every workaround in tests must include a `// NOTICE:` comment:

```ts
// NOTICE:
// Why this workaround is needed.
// Root cause summary.
// Source/context (file, issue, URL, or node_modules reference).
// Removal condition (when it can be safely deleted).
```

- Do not rely on smoke-only tests. Reproduce bugs/failures before patching. Use this format for regression test root-cause blocks when relevant:

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

## §3: Naming & Comments

- File names: camelCase.
- Prefer names that rely on the module boundary for context. Repeat package/product/protocol prefixes only when a symbol crosses a boundary where that context is no longer obvious.
- Name functions after the domain operation, not the implementation layer. Call sites should stay readable after refactors.
- Avoid names encoding multiple layers of ownership. If a name needs several qualifiers, reconsider the module boundary.
- Nouns for resolved domain concepts; verbs for transformations or side effects.
- Prefer classes for runtime/browser APIs and substantial modules owning state/lifecycle. Prefer FP for pure transformations and local helpers.
- Use DI only at real external boundaries (database, model runtime, queue, Redis, filesystem, network, clock, environment, feature gates). Do not create `Dependencies`/`Deps` objects for internal functions calling sibling helpers.
- Add concise comments for utils, math, OS-interaction, algorithms, shared, and architectural code explaining non-obvious intent, invariants, constraints, or why the code is needed.
- Use `// NOTICE:` for workarounds (why, root cause, source context, links).
- Keep existing comments intact when moving/refactoring code. If removing, replace with a comment noting what it described and why it was removed.
- Markers: `// TODO:` follow-ups, `// REVIEW:` concerns, `// NOTICE:` hacks/context/external references.
- For public APIs, package-level exports, and non-trivial exported symbols, include `/** */` JSDoc with what it does, when to use it, and what to expect. Skip JSDoc on trivial one-line helpers.
- For normalizers (exported or not), add `/** */` with before/after examples.
- For runner/CLI entrypoints, JSDoc is required and must include a call-stack diagram with `{@link}` references when it clarifies a stable architecture boundary.
- For exported interfaces with options, put detailed semantics on individual fields, not in one large interface-level block. `@default` for every option with a default.
- Avoid stubby/hacky scaffolding. Prefer small refactors that leave code cleaner.

## §4: Module Design

- Prefer deep modules over shallow ones. A module should hide a meaningful decision: policy, persistence boundary, protocol/schema contract, scheduling semantics, model prompt contract, domain invariant, or lifecycle concern.
- Do not split code by execution order alone. A module boundary should represent a stable responsibility understandable without reading all sibling files.
- Keep cohesive domain flows together until proven pressure to split. A 200–400 line cohesive module is preferable to several shallow modules passing the same context through each other.
- Before creating `createXService` or `XDependencies`, verify that `X` adds policy, validation, state, retry/error handling, IO boundary, or a reusable abstraction. If not, keep it as a private helper.
- Avoid pass-through services like `createXService({ yService })` when `X` adds no meaningful policy, validation, state, or abstraction.
- Do not extract tiny one-call helpers just to name a step, reduce line count, or ease testing. Extract only when: reused by multiple production call sites, hides non-trivial branching/IO/parsing/normalization/error policy, names a stable domain concept, or forms part of a public API.
- Test through stable public behavior. Do not create new exports, dependency bags, or wrapper services solely to mock private implementation details.
- Keep reusable domain contracts and rendering/building logic in the package that owns the domain. Runtime entrypoints wire dependencies and call boundaries instead of inlining large reusable contracts.
- Do not split modules using `========` separators. Use cohesive private helper groups or split into modules only when the new module owns a distinct responsibility.
- Do not overuse table-driven style. Keep table arrays inline and map with `.map(...)` when natural.
- Prefer early returns. Limit nesting when it improves readability, but do not introduce pass-through helpers solely to reduce indentation.
- Do not move everything into constants. One-time or two-time constants should remain near usage with `/** */` explaining why.
- For configurable options with defaults, prefer `@moeru/std` merge functions and documented default objects over broad standalone constants.
- For retry/backoff/limit values, do not use one standalone constant to cover everything.
- Avoid hardcoded Unix/macOS/Windows path literals; prefer path-safe array arguments and cross-platform handling.

## §5: Git & Workflow

- Rebase pulls. Branch naming: `username/feat/short-name`.
- Conventional Commits for messages (e.g., `feat(stage-tamagotchi): add runner reconnect backoff`). Gitmoji is prohibited.
- Summarize changes, how tested (exact commands), and follow-ups.
- Improve legacy code you touch; avoid one-off patterns.
- Keep changes scoped. Use workspace filters (`pnpm -F <package> <script>`).
- Maintain structured `README.md` for each `packages/` and `apps/` entry: what it does, how to use, when to use, when not to use.
- Run `pnpm typecheck` and `pnpm lint` after finishing a task.
- Do not create commits during implementation unless the user explicitly requests it.

## §6: Styling & Components

- Prefer Vue v-bind class arrays: `:class="['px-2 py-1', 'flex items-center', 'bg-white/50 dark:bg-black/50']"`. Avoid long inline `class=""`. Refactor legacy when you touch it.
- Use/extend UnoCSS shortcuts/rules in `uno.config.ts`. Add new shortcuts/rules/plugins there when standardizing. Prefer UnoCSS over Tailwind.
- Check `apps/stage-web/src/styles` for existing animations; reuse or extend before adding new ones.
- Build primitives on `@proj-airi/ui` (reka-ui) instead of raw DOM. See `packages/ui/src/components/Form` for implementation patterns.
- When adding or updating components in `packages/ui`, update `docs/ai/context/ui-components.md` (props, slots, emits, description).
- Use Iconify icon sets; avoid bespoke SVGs.
- Animations: keep intuitive, lively, and readable.
- `useDark` (VueUse): set `disableTransition: false` or use existing composables in `packages/ui`.

## §7: Dependencies

- Before adding any dependency, search for existing internal implementations first. If the logic could become shared, propose that approach.
- For tasks involving `node:*` built-ins, DOM operations, Vue composables, Vite plugins, or GitHub Actions workflows, research existing libraries before choosing. Always ask the user to choose and help judge — never choose generalized utility libraries (`es-toolkit`, `@unjs/*`, `tinylib/*`) without explicit confirmation.
- If docs conflict with typecheck results, inspect the dependency source under `node_modules` to diagnose root cause.
- When a user asks to use a specific dependency, check Context7 docs with the search tool, then inspect actual usage in this repo. If multiple names appear without clear distinction, ask the user to confirm.

## §8: i18n

- Add/modify translations in `packages/i18n` only. Never scatter i18n across apps/packages.

## §9: Development Practices

- Keep runtime entrypoints lean. Move heavy logic into services/modules.
- Use Valibot for schema validation. Keep schemas close to their consumers.
- When modifying code, check for opportunities to do small progressive refactors alongside the change.
- If refactor scope is small, do it step by step. Avoid one-off patterns.
- Do not export helpers only to satisfy tests or documentation rules. Keep implementation helpers private unless production code reuses them.
