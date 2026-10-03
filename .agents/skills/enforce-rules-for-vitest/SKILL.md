---
name: enforce-rules-for-vitest
description: Enforce AIRI's testing and Vitest practices in the AIRI monorepo. Use when you create, edit, review, or debug tests. Also use when you reproduce a reported bug or issue, change Vitest configuration, or diagnose test import and runtime-boundary failures. Also use when you mock IPC, services, providers, platform APIs, or imports.
---

# Enforce AIRI Vitest Rules

Apply these rules to every test change in AIRI.

## Choose the Test Scope

- Use Vitest to verify the behavior of each module that you implement.
- Use the Vitest project that owns the affected code. Keep runs targeted for speed.
- Grow component and end-to-end coverage progressively. Prefer Vitest browser mode when the behavior depends on DOM or Web Platform APIs.
- Use the smallest automated test that faithfully exercises the behavior. Prefer a unit test, then the smallest suitable higher-level test.
- Do not rely on smoke-only tests.

## Reproduce Bugs Before Fixing Them

1. For an investigated bug or issue, try to add a test-only reproduction before you change production code.
2. When reproduction is possible, include the tracker identifier in the test case name:
   - Use `Issue #<number>` for a GitHub issue.
   - Use the Linear issue key for an internal Linear bug.
3. Put the actual report URL in a comment directly above the regression test. Use the GitHub issue URL, Discord message or thread URL, or Linear issue URL as appropriate.
4. Confirm that the reproduction fails for the reported reason before you implement the fix.
5. After the fix, add a comment below the report URL that explains the root cause and the fix. Use this format:

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

## Mock Real Boundaries

- Mock Electron IPC and Electron services with `vi.fn` or `vi.mock`. Never require a real Electron runtime.
- For external providers and services, add mock-based tests. When feasible, also add integration-style tests guarded by environment variables. Vitest import mocks are allowed for these boundaries.
- Do not mock Pinia or Vue components.
- Test through stable public behavior. Do not create new exports, dependency bags, or wrapper services only to make private implementation details mockable.
- Assert observable behavior, including mock calls and parameters, with explicit `expect` statements.
- Prefer one assertion per line so that failures stay readable.

## Preserve Runtime Integrity

- Do not test impossible runtime states. Do not assert against constants that cannot change. Do not assert against object mutations that can only occur inside the same test setup.
- Do not replace `globalThis` properties or built-in modules with direct `Object.defineProperty(...)` mocks.
- When behavior depends on a different Node global or built-in state, use `node:worker_threads` to load an isolated worker. You can also build a minimal CLI reproduction.
- For DOM and Web Platform APIs, use Vitest browser mode instead of hard-mocking platform internals.
- If a test that you change hard-mocks a platform API, move that test to browser mode in the same change.

## Fix Import Boundaries, Not Tests

Never use Vitest mocks, hoisting, dynamic imports, `as unknown as`, or test-only alternate import paths to conceal a real import failure.

If a test cannot import a module, investigate and fix the production boundary:

- package exports and declarations
- import-time side effects
- mixed Node and browser type dependencies
- circular imports
- an incorrect public module shape

Keep the test importing the same supported boundary that production consumers use.
