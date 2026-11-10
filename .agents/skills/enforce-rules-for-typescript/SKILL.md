---
name: enforce-rules-for-typescript
description: Enforce AIRI's TypeScript and Vue source rules for imports, naming, comments, JSDoc, fallbacks, stateful and protocol code, and module design. Use when writing, refactoring, or reviewing TypeScript or Vue source code in the AIRI monorepo.
---

# Enforce AIRI TypeScript Rules

Apply these rules to every TypeScript and Vue source change in AIRI. The root `AGENTS.md` gives the core code rules. This skill gives the detailed rules.

## Imports and Types

- Import types from the module or package that owns the contract. Do not redeclare an external or public contract locally to use a narrower subset.
- Do not route type imports through local runtime assembly modules when the original side-effect-free type source is available.
- If Node-only and browser-only types mix in one import chain, move the type declarations into a neutral type file. Keep the runtime modules environment-specific.
- Do not import values from a module that has side effects only to get its types.
- If a wrong or missing export causes an error, trace the full import chain and side-effect chain first. Fix the package exports or the owning boundary. Do not add a local workaround import at the leaf.
- Before you fix an import or type error, examine the compilation behavior and the type declarations. Also examine the `exports` field in `package.json`, and the browser and Node entry points of the dependency.
- Keep JSON Schemas compliant with providers. Give an explicit `type: object` and the required fields. Do not use unbounded records.

## Naming

- Let module boundaries provide context. Do not repeat package, product, protocol, or transport names in symbols. The exception is a symbol that crosses a boundary where that context is otherwise lost.
- Name functions after domain operations, not implementation layers.
- Use nouns for resolved domain concepts. Use verbs for transformations and side effects.
- If a symbol needs several ownership qualifiers to be clear, reconsider the module boundary or introduce a clearer domain concept.

## Comments

- Write a comment only for information that the code cannot express clearly: intent, constraints, ownership, invariants, precedence, lifecycle, ordering, side effects, protocol shape, or non-obvious fallbacks.
- Do not add comments that only restate names, types, or visible operations.
- Treat a contract comment as an explanation of the relationship between a producer and its consumers.
- Explain why a value exists in the system before you explain how the code represents it.
- Describe the decision, behavior, or invariant that a value controls.
- If different values select different control-flow or UI paths, describe each observable outcome.
- If a value crosses a module or component boundary, identify the consumer and how it applies the value.
- Put representation details after behavior: units, coordinate systems, thresholds, clamps, and source API fields.
- Put background evidence after the contract: browser behavior, issue links, investigation history, and removal conditions.
- If the name, type, and surrounding code express the full contract, omit the comment.
- Put an implementation comment next to the branch, calculation, transition, or side effect that it explains.
- In calculation-heavy code, explain non-obvious coordinate systems, units, conversions, clamps, rounding, aggregation, and precedence. Put each explanation next to the related intermediate value or branch.
- Prefer clearer names, types, and structured state over comments that compensate for hidden or encoded concepts.
- When you move code, keep the accurate comments. Remove the comments that no longer describe current behavior.
- Write an investigation-heavy comment as short paragraphs. When useful, give the context and the observed failure. Then give the reason that the obvious fix is not sufficient. Give the chosen fix and its removal condition or references.
- Use these markers:
  - `// TODO:` for follow-up work.
  - `// REVIEW:` for a concern that needs another opinion.
  - `// NOTICE:` for workarounds, magic values, external constraints, and other important non-obvious context. The root `AGENTS.md` gives the required format for a workaround.

## JSDoc

- Use JSDoc for public APIs, package-level exports, shared architectural boundaries, and non-trivial exported functions, classes, and types.
- In JSDoc, document only the contract details that the signature cannot express: assumptions, side effects, lifecycle, and return guarantees.
- Do not export a helper only to satisfy tests or documentation rules. Keep implementation helpers private unless production code reuses them.
- Do not add JSDoc to trivial helpers, local projections, or pass-through functions.
- Do not use fixed section templates that restate names and signatures. Prefer precise names and branch-local comments for implementation details.
- For exported test helpers or non-obvious reusable test fixtures, add `@example` when it clarifies the intended usage.
- Do not attach JSDoc or `@example` blocks to ordinary `describe`, `it`, or `expect*` calls.
- For exported interfaces and type aliases, keep the top-level JSDoc on what the type represents. Put detailed semantics on the related fields.
- Document generic parameters with `@param`. Add `@default` to every option that has a default value.
- Give each runner and CLI entry point `/** ... */` JSDoc with a clear ASCII call-stack diagram. Use `{@link ...}` references where applicable.
- For a server orchestrator, add a call-stack diagram only when it clarifies a stable architecture boundary. Do not add diagrams to shallow glue code.
- Use this format for the call-stack section:

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

- Give `/** ... */` JSDoc with an `@example` to each exported normalizer, shared normalizer, and non-obvious local normalizer. This applies to normalizers of outputs, formats, file names, and values. It does not apply to config default normalization.
- In the example, show a representative input and output. Use this format:

  ```ts
  /**
   * Normalizes <target>.
   *
   * @example
   * normalizeTarget('ExampleInput')
   * // => 'example-output'
   */
  ```

## Fallbacks and Precedence

- If a fallback chain has more than two sources, make the precedence explicit.
- Some fallback sources represent different schema versions, compatibility behavior, specificity levels, or user and system overrides. For these sources, explain why each non-primary branch exists and why it has that priority.
- Do not use nested ternaries for a fallback chain when any branch is non-obvious. Use named intermediate variables or `if` / `else if` blocks, so that each comment can be next to its branch.
- Do not use a new object or array as a casual fallback. Expressions such as `value ?? {}`, `value ?? []`, `value || {}`, and `value || []` create a new reference each time.
- Never use an inline object or array fallback in a reactive getter, computed value, watcher source, or Pinia state projection. New references can cause false changes, watcher loops, and state broadcasts.
- If an immutable empty fallback is valid, reuse a stable module-level value. If consumers must not mutate the value, freeze it.
- Use `??` only when `null` and `undefined` mean that a value is missing. Use `||` only when `false`, `0`, and an empty string must also select the fallback.
- In non-trivial domain or protocol code, a fallback can return an empty string, stale value, cached value, default value, or ignored result. At that return or branch site, explain why the fallback is safe.
- The root `AGENTS.md` gives the rules for backward-compatibility fallbacks.

## Stateful and Protocol Code

- Some code implements a protocol, state machine, lifecycle, cache, request and response flow, event routing, watcher, session, cookie, or cleanup sequence. Document the state model of this code near the implementation.
- Distinguish these kinds of state in names or nearby comments: persisted configuration, discovered filesystem state, runtime-loaded state, cache state, session or cookie state, watcher state, and external side effects.
- Some methods look like state transitions, such as `setEnabled`, `load`, `unload`, `dispose`, `start`, `stop`, or `refresh`. If the owning type or module does not make it obvious, make clear which state each of these methods changes.
- When you match events or responses, document the correlation keys and isolation rules. Examples are `requestId`, `sessionId`, `ownerExtensionId`, `bindingId`, the route namespace, and the source window.
- Make each ignored event understandable in its event handler. A handler can ignore an event because of a route mismatch, owner mismatch, stale request ID, disposed lifecycle, or wrong source. Show that reason in code or in a named predicate.
- For a request and response flow, define or name the envelope shape near the producer and the consumer.
- Document what happens to pending requests on timeout, close, unload, dispose, and publish failure.
- When cleanup spans multiple owners, keep the order visible. Explain why the order is important.
- When you return a snapshot, fallback value, stale value, or cached value, document its freshness at the return site.
- For watchers, event listeners, and async background work, make ownership and shutdown behavior explicit. Tell what starts and stops the work, and whether duplicate starts are allowed. Tell what happens to in-flight work during unload or dispose.

## Module Design

- Prefer deep modules over shallow modules. A module must hide a meaningful decision: policy, persistence boundary, protocol or schema contract, scheduling semantics, model prompt contract, domain invariant, or lifecycle concern.
- Do not split code by execution order alone. A module boundary must represent a stable responsibility that a reader can understand without all of the sibling files.
- Keep cohesive domain flows together until there is proven pressure to split them. A cohesive module of 200 to 400 lines is better than several shallow modules that pass the same context or options to each other.
- Split a module only when the new module owns a distinct responsibility. Do not split a file only to reduce nesting or line count, or to create a test seam.
- Do not divide a module into sections with separators such as `========`. Use cohesive groups of private helpers.
- Before you create a new `createXService` or `XDependencies`, make sure that `X` adds value. Value means policy, validation, state, retry or error handling, an IO boundary, or a reusable abstraction. If `X` adds no value, keep it as a private helper or inline it.
- Do not create a pass-through service such as `createXService({ yService })` when `X` adds no policy, validation, state, or abstraction.
- Keep special cases near the branch that they affect.
- Some helpers manipulate encoded keys, ownership, filesystem paths, routes, or protocol-shaped data. Make the invariant of such a helper explicit in its structure, name, or nearby documentation.
- Keep reusable domain contracts and rendering or building logic in the package that owns the domain. Runtime entry points wire dependencies and call those boundaries. They do not inline large reusable contracts.
- Keep runtime entry points lean. Move heavy logic into services or modules.
- Prefer early returns, and keep functions simple. Limit nesting when it improves readability. Do not add pass-through helpers or shallow modules only to reduce indentation.
- The root `AGENTS.md` gives the rules for classes and dependency injection.

## Constants, Options, and Tables

- Do not move everything into constants. Keep a constant that is used one or two times near its usage. Usually, put it near the top of the file, after the imports. Add a `/** ... */` comment that tells why the constant exists.
- For configurable options with defaults, prefer the merge functions of `@moeru/std`. When possible, define the defaults as a documented object, not as separate standalone constants.
- For retry, backoff, and limit values, do not use one standalone constant for all of them.
- Do not use table-driven style too much. In many cases, keep the table array inline and map it directly with `.map(...)`.

## OS, Process, and Paths

- For non-obvious OS, exec, process, argument, networking, file, or directory handling, explain the constraint or purpose near the code.
- Do not hardcode Unix, macOS, or Windows path literals. Use path-safe array arguments and cross-platform handling.

## Readability Refactors

- A readability-only change must keep the runtime behavior. If the behavior changes, add focused tests and document the contract change.

## Review Checklist

When you review a complex TypeScript module, examine these points:

- Can a reader identify owned state, external side effects, lifecycle transitions, cleanup, and freshness without tracing several neighboring files?
- Are protocol envelopes, correlation keys, isolation rules, and fallback precedence explicit at their decision points?
- Do module and helper boundaries hide meaningful policy, or do they only forward context or hide special cases?
- Do comments explain non-obvious decisions next to the related code, without restating names, types, or visible operations?
