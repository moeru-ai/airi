# Copilot repository instructions

This is the `moeru-ai/airi` pnpm monorepo. Prefer the smallest safe change and keep every task inside its stated scope.

## General rules

- Follow the root `AGENTS.md` instructions.
- Do not modify unrelated files.
- Do not mix documentation, agent configuration, and runtime logic changes in one patch.
- Do not change package files, lockfiles, or workspace configuration unless the task explicitly requires it.
- Preserve existing test style and helpers.
- Do not claim tests passed unless you actually ran them.
- Report exact commands, exit codes, and relevant pass/fail output.

## Validation

- Use package-scoped pnpm commands where possible.
- Run the narrowest relevant test first.
- Run typecheck if runtime contracts or exported types changed.
- Run affected package tests if shared logic changed.
- Run `git diff --check` before finalizing when possible.

## Output format

1. Confirmed facts
2. Files changed
3. Commands run
4. Test results
5. Remaining risks
6. Keep / revert / split recommendation
