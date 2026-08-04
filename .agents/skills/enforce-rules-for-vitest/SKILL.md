---
name: enforce-rules-for-vitest
description: Enforce AIRI's testing and Vitest practices. Use when creating, editing, reviewing, or debugging tests; reproducing a reported bug or issue; changing Vitest configuration; mocking IPC, services, providers, platform APIs, or imports; or diagnosing test import and runtime-boundary failures in the AIRI monorepo.
---

# Enforce AIRI Vitest Rules

Apply these rules to every test change in AIRI.

## Choose the Test Scope

- Use the Vitest project that owns the affected code and keep runs targeted for speed.
- Grow component and end-to-end coverage progressively. Prefer Vitest browser mode when the behavior depends on DOM or Web Platform APIs.
- Use the smallest automated test that faithfully exercises the behavior: prefer a unit test, then the smallest suitable higher-level test.

## Reproduce Bugs Before Fixing Them

1. For an investigated bug or issue, try to add a test-only reproduction before changing production code.
2. When reproduction is possible, include the tracker identifier in the test case name:
   - Use `Issue #<number>` for a GitHub issue.
   - Use the Linear issue key for an internal Linear bug.
3. Put the actual report URL in a comment directly above the regression test. Use the GitHub issue URL, Discord message or thread URL, or Linear issue URL as appropriate.
4. Confirm that the reproduction fails for the reported reason before implementing the fix.

## Mock Real Boundaries

- Mock Electron IPC and Electron services with `vi.fn` or `vi.mock`; never require a real Electron runtime.
- For external providers and services, add mock-based tests and, when feasible, integration-style tests guarded by environment variables, but do not mock Pinia, Vue components. Vitest import mocks are allowed for these boundaries.
- Assert observable behavior, including mock calls and parameters, with explicit `expect` statements.
- Prefer one assertion per line so failures remain readable.

## Preserve Runtime Integrity

- Do not test impossible runtime states. Avoid assertions against constants that cannot change or object mutations that can only occur inside the same test setup.
- Do not replace `globalThis` properties or built-in modules with direct `Object.defineProperty(...)` mocks.
- When behavior depends on a different Node global or built-in state, use `node:worker_threads` to load an isolated worker or build a minimal CLI reproduction.
- For DOM and Web Platform APIs, use Vitest browser mode instead of hard-mocking platform internals. Progressively refactor existing direct platform mocks when touched.

## Fix Import Boundaries, Not Tests

Never use Vitest mocks, hoisting, dynamic imports, `as unknown as`, or test-only alternate import paths to conceal a real import failure.

If a test cannot import a module, investigate and fix the production boundary:

- package exports and declarations;
- import-time side effects;
- mixed Node and browser type dependencies;
- circular imports;
- an incorrect public module shape.

Keep the test importing the same supported boundary that production consumers use.
