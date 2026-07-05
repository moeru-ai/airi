# PR #65 resolve conflicts + fix Cycle det. / publish-once reentrancy

SITUATION: PR #65 (`refactor/pretauri` → `origin/main`) is in CONFLICTING/DIRTY state. Origin/main committed regenerated TypeDoc docs (`e485261fe`) so the pretauri docs conflict with the regenerated docs. Git merge origin/main into pretauri results in conflicts. README auto-merges. I will:

Step 1: Resolve conflicts (take `origin/main` for the two generated docs files since it has CI-regenerated newer docs).
Step 2: Fix reentrancy (`delete` before `await`/handler) in both `emit` and `publish` in `core/events/bus.ts`.
Step 3: Fix DFS cycle detection missing `break` in `core/cognition/validator.ts`.
Step 4: Verify with `pnpm typecheck` and run tests.
Step 5: Commit + push.

I will apply the fixes directly (not delegate). Blast radius: ~3 isolated edits in ~3 distinct symbols. Conflicts expected on auto-generated docs only.