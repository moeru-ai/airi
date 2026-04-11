# Coding Agent Polishing Protocol

> **Core principle**: Don't add features. Run real tasks, find the first stupid thing, fix only that, add a test, re-run.

## 1. Task Selection

### Fixed task pool (rotate, don't cherry-pick)

Pick 4–6 tasks covering these **mandatory** categories:

| Category | Example | What it tests |
|----------|---------|---------------|
| **Existing-file small edit** | Change a default value in a config | Patch precision, file targeting |
| **Planted bug fix** | Typo in an import, off-by-one | Bug detection, edit_file accuracy |
| **Cross-file fix** | Rename export, update callers | Multi-file coordination, search |
| **Verification-heavy** | Edit + must pass `vitest run X` | Tool selection, verification planning |

### Repo selection rules

- ≥2 repos you don't control (open-source, different languages/structures)
- ≥1 repo that is YOUR production code (AIRI itself)
- Never only run tasks you designed to succeed — include at least 1 task where failure is expected

### Task writing rules

- Goal must be **specific** ("fix the broken import in `packages/ui/src/index.ts`", not "improve the codebase")
- Validation must be **mechanically checkable** (git diff, string grep, test pass — not "looks right")
- No task should be solvable in <3 tool calls (too trivial to be informative)

---

## 2. Run Recording — The "Stupidity Log"

After EACH run, fill this template. **No skipping fields.**

```
### Run Record: [task name] — [date]

**Repo**: [name + path]
**Task category**: existing-edit | bug-fix | cross-file | verification
**Engine status**: completed | budget_exhausted | error | aborted
**Validation status**: passed | failed
**Task correctness**: correct | partial | wrong | not-attempted

#### Metrics
- Turns used: X / max Y
- Tool calls: X
- Tokens: XK (provider | estimated)
- Patch attempts: X (succeeded: Y, failed: Z)
- Bash calls: X (read-only: Y, unnecessary: Z)
- Text-only rounds: X
- Verification commands run: X (relevant: Y, irrelevant: Z)

#### First Stupidity
- **Turn #**: [which turn]
- **What happened**: [one sentence]
- **Root cause**: patch-mismatch | wrong-tool | wrong-file | bad-verification | path-guessing | bash-abuse | budget-waste | other
- **What should have happened**: [one sentence]

#### Additional Stupidities (if any)
- Turn #X: [description] — [root cause tag]

#### Verdict
- [ ] Worth fixing (clear pattern, likely recurrent)
- [ ] Not worth fixing (one-off, model randomness)
- [ ] Needs prompt change
- [ ] Needs tool-router change
- [ ] Needs engine logic change
- [ ] Needs test extraction
```

---

## 3. Scoring — 4 Layers, No Shortcuts

Every task gets scored on 4 independent axes. **Do NOT collapse into a single pass/fail.**

| Axis | Score | Meaning |
|------|-------|---------|
| **Engine completion** | ✅ completed / 🟡 budget_exhausted / 🔴 error | Did the loop finish cleanly? |
| **Validation** | ✅ passed / ❌ failed | Did the mechanical check pass? |
| **Task correctness** | ✅ correct / 🟡 partial / ❌ wrong | Is the actual change right? |
| **Behavior quality** | A/B/C/D | See rubric below |

### Behavior quality rubric

| Grade | Meaning |
|-------|---------|
| **A** | No unnecessary tool calls, no patch retries, verification on first attempt |
| **B** | ≤1 patch retry, ≤1 unnecessary bash, verification correct |
| **C** | Multiple patch retries OR wrong verification command OR significant bash abuse |
| **D** | Couldn't find the file, went down a dead-end path, or fabricated verification |

### What counts as "passed" for iteration purposes

A run is only **fully passed** if ALL of:
- Engine: completed (not budget_exhausted)
- Validation: passed
- Correctness: correct
- Behavior: A or B

Everything else is a data point for improvement, not a success to celebrate.

---

## 4. Root Cause Tags — Fixed Vocabulary

Use these tags consistently. Don't invent new ones unless a pattern truly doesn't fit.

| Tag | Meaning | Fix surface |
|-----|---------|-------------|
| `patch-mismatch` | edit_file old_text didn't match | edit-engine.ts fuzzy layers |
| `wrong-tool` | Used bash when should have used search_text | system-prompt.ts, tool-router.ts |
| `wrong-file` | Edited a file that wasn't the target | system-prompt.ts goal framing |
| `bad-verification` | Ran irrelevant test or no test | system-prompt.ts VERIFY phase |
| `path-guessing` | Assumed `src/` exists without listing | system-prompt.ts DISCOVER phase |
| `bash-abuse` | Used bash for ls/grep/find instead of tools | tool-router.ts bash guard |
| `budget-waste` | Re-read unchanged files, empty turns | engine.ts cache / nudge logic |
| `write-file-bias` | Used write_file on existing file | system-prompt.ts, tool definitions |
| `verification-skip` | Skipped verification entirely | engine.ts exit logic |
| `false-success` | Claimed done without evidence | engine.ts completion criteria |
| `env-assumption` | Assumed deps installed / command exists | system-prompt.ts, detectToolchain |

---

## 5. Test Extraction — From Stupidity to Regression Test

When a root cause appears **≥2 times across different runs**, it graduates to a test:

### Decision tree

```
Is it a patch matching issue?
  → edit-engine.test.ts: add the exact old_text/new_text pair that failed

Is it a tool selection issue?
  → hardening.test.ts: mock the scenario, assert correct tool is chosen

Is it a budget/loop issue?
  → engine.test.ts: test the specific state transition

Is it a verification planning issue?
  → No unit test possible → add to e2e-realworld.ts scenario pool

Is it a prompt/descriptor issue?
  → No automated test → document in POLISHING-LOG.md as "prompt debt"
```

### Test naming convention

```typescript
// Link to the run that exposed the bug
// Run record: 2026-04-11, qq-bot planted-bug-fix
it('Issue: patch-mismatch on whitespace-only difference (qq-bot 04-11)', () => {
  // ...
})
```

---

## 6. Iteration Rules

### One round = one fix

1. Run all tasks (4–6)
2. Collect stupidity logs
3. Find the **most frequent** root cause tag
4. Fix **only that one thing**
5. Add test(s)
6. Re-run same tasks
7. Compare metrics

### What to compare between rounds

| Metric | Better = | Noise threshold |
|--------|----------|----------------|
| Patch retry count | Lower | ±1 is noise |
| Unnecessary bash calls | Lower | Any reduction is real |
| Text-only empty turns | Lower | ±1 is noise |
| Total turns to completion | Lower | ±2 is noise |
| Total tokens | Lower | ±5K is noise |
| Behavior grade distribution | More A/B | Moving from D→C is real |

### When to stop a polishing round

- The most frequent root cause appears in **0 or 1** runs (down from ≥2)
- OR the fix didn't help → revert, pick the next root cause

### When to NOT commit

- Fix makes tests fail
- Fix helps one scenario but hurts another
- Fix is a "maybe it helps" prompt tweak with no measurable signal

---

## 7. Polishing Log Template

Keep this as a running file. One section per round.

```markdown
## Round N — [date]

### Task pool
1. [repo] [category] [task description]
2. ...

### Results summary
| Task | Engine | Validation | Correctness | Behavior | First stupidity |
|------|--------|------------|-------------|----------|----------------|
| ...  | ...    | ...        | ...         | ...      | ...             |

### Root cause frequency
| Tag | Count |
|-----|-------|
| patch-mismatch | 3 |
| bash-abuse | 1 |

### Fix applied
- **Target**: [root cause tag]
- **Change**: [one sentence]
- **Files**: [list]
- **Test added**: [yes/no, test name]

### Re-run results
| Task | Before | After | Delta |
|------|--------|-------|-------|
| ...  | C      | B     | +1    |

### Verdict
- [ ] Fix is real — commit
- [ ] Fix is noise — revert
- [ ] Fix helps some, hurts others — needs refinement
```

---

## 8. Anti-Patterns — Things This Protocol Forbids

1. **"It passed once so it works"** → No. Run ≥2 times.
2. **"Let me add 3 features to fix this"** → No. One fix per round.
3. **"100% pass rate"** → We don't chase this number. We chase behavior grade A.
4. **"PRODUCTION READY"** → Banned phrase. Use "stable on scenario set X".
5. **"I'll write the test later"** → No. Test goes in the same commit as the fix.
6. **"Let me redesign the architecture"** → No. Small, targeted changes only.
7. **Reporting success without listing first stupidity** → Invalid run record.

---

## 9. Current Baseline (as of 2026-04-11)

### What works
- Loop closes on simple tasks (JSDoc, planted bug)
- 6-layer fuzzy matching handles most whitespace mismatches
- Bash guard blocks file-mutating shell commands
- Budget tracking with heuristic fallback when provider lacks usage stats
- Read/list caching saves tokens on repeated operations
- TEST_ROOT isolation prevents host pollution

### Known weak points (not yet systematically tested)
- `write_file` bias on existing files
- Verification command selection (runs `pnpm test` instead of scoped test)
- Path guessing without `list_files` first
- Large file navigation (>500 lines) — outline helps but not always used
- Cross-file edits in unfamiliar repo structures

### Test coverage
- 872 unit/integration tests passing
- 0 systematic real-world regression tests (e2e-realworld.ts is a one-shot runner, not a regression suite)

---

## 10. Getting Started

```bash
# 1. Pick your task pool (edit this file's scenarios or write new ones)
# 2. Run the e2e suite
AIRI_AGENT_API_KEY=<key> AIRI_AGENT_BASE_URL=<url> AIRI_AGENT_MODEL=<model> \
  pnpm exec tsx src/query-engine/e2e-realworld.ts --runs 2

# 3. Collect the stupidity log (manually from terminal output)
# 4. Fill in the run record template above
# 5. Identify the most frequent root cause
# 6. Fix it, test it, re-run
```

The protocol works when you stop asking "did it pass?" and start asking **"where did it first do something stupid?"**
