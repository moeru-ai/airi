# Antigravity Continuation Roadmap

This document is the **ongoing execution guide** for continuing `services/computer-use-mcp` after the current verification hardening work.

Use this together with:

- `services/computer-use-mcp/antigravity-handoff.md`

The handoff file explains the current branch state.
This roadmap explains **what to do next**, **what not to do**, and **how Gemini vs. Codex should divide work**.

---

## 1. Operating model

This repo now uses a split workflow:

### Gemini / Antigravity is good for

- drafting implementation plans
- reading lots of code and proposing bounded code changes
- writing feature code and focused tests
- iterating on a single workstream

### Codex is responsible for

- independent review
- reality checks against the actual worktree
- rejecting bad direction, not just bad syntax
- cleaning up mixed trees
- commit slicing
- final validation
- push / PR / submission hygiene

Treat this as a hard division of labor:

- **Gemini writes**
- **Codex reviews, trims, validates, commits, and pushes**

Gemini should **not** be trusted to decide when a workstream is “done” without Codex review.

---

## 2. Current baseline

At the time this roadmap was written, the branch already contains:

- `68f68c39` Cut 1: structured verification evidence and handoff fulfillment
- `90f77b54` Cut 2: terminal hygiene
- `459ecee9` Cut 3: strategy cleanup and anti-spam stabilization
- `753d701f` follow-up handoff / support cleanup

Before any new work starts:

1. read `services/computer-use-mcp/antigravity-handoff.md`
2. verify the branch is still on the expected base
3. do **not** start a new workstream on top of an unexpectedly dirty tree

---

## 3. Approved next workstreams

These are the only recommended directions right now.

### Workstream A: Branch hygiene and review flow

This is the immediate next step if branch publishing/review has not happened yet.

Scope:

- push local commits
- open / prepare PR
- review the current evidence + handoff + hygiene stack as landed
- fix review findings

This workstream has priority over new features.

### Workstream B: Browser evidence refinement

Only start this **after** the current branch state has been reviewed.

Goal:

- improve browser-side evidence quality
- keep it non-blocking at first

Allowed work:

- stronger `browser_dom_click` evidence structure
- clearer browser observation summaries
- better browser-side integration tests

Not allowed yet:

- DOM hash hard gates
- page load hard fail rules
- auto-repair loops

### Workstream C: Browser async stabilization nudges

This is only valid after browser evidence is stronger.

Goal:

- add lightweight nudges for page loading / DOM not ready / likely stale reads

Allowed work:

- advisory-only “page still loading” style nudges
- `document.readyState`-based hints
- narrow tests

Not allowed yet:

- blocking on `readyState`
- retry loops hidden inside tool handlers

### Workstream D: Evidence confidence normalization

This can run after or alongside browser evidence refinement.

Goal:

- normalize confidence semantics across screenshot / runtime fact / heuristic / self-report evidence

Allowed work:

- tightening confidence assignment
- reducing overclaimed confidence
- evidence summary cleanup

Not allowed yet:

- using confidence alone as a gate to fail actions

---

## 4. Explicitly forbidden directions for now

Do **not** let Gemini resume these by itself:

1. “Phase 8” browser DOM staleness work on an unreviewed mixed tree
2. reintroducing duplicate-click hard blocking
3. using window title or foreground app alone as proof of success
4. treating self-report as blocking evidence
5. hidden PTY mutations disguised as hygiene
6. broad “repair contracts” that automatically retry UI mutations
7. more roadmap theater, phase naming, or “all done” summaries without clean review boundaries

If Gemini proposes one of these, stop and hand review back to Codex.

---

## 5. Session protocol for Gemini

Every Gemini work session should follow this exact loop.

### Before coding

Gemini must:

1. read:
   - `services/computer-use-mcp/antigravity-handoff.md`
   - `services/computer-use-mcp/antigravity-roadmap.md`
2. state which single workstream it is working on
3. name the exact files it expects to touch

### During coding

Gemini should:

- keep scope bounded
- prefer one coherent subtask at a time
- add real tests near the changed behavior
- avoid fake shape-only tests

Gemini should not:

- commit
- push
- rewrite commit strategy
- claim the work is “fully complete” unless the tree is clean and validated

### At handoff back to Codex

Gemini must provide:

1. files changed
2. exact validation commands run
3. whether package `typecheck` was run
4. whether changes are advisory-only or behavior-changing
5. known risks / open questions

---

## 6. Session protocol for Codex

Codex should always do the final gate.

Checklist:

1. independently inspect the actual diff
2. rerun validation
3. call out semantic problems, not just failing tests
4. decide whether the change belongs in:
   - an existing commit line
   - a new commit
   - or should be discarded
5. perform commit slicing
6. push / PR only after the tree is reviewable

Codex should assume Gemini may:

- overstate completion
- mix unrelated changes
- write tests that prove the wrong thing
- escalate advisory logic into hard gating too early

---

## 7. Definition of done for a workstream

A workstream is only “done” when all of these are true:

1. package `typecheck` passes
2. relevant targeted tests pass
3. change scope is coherent
4. review findings are addressed
5. the tree is either clean or intentionally isolated for the next commit
6. Codex agrees the semantics are acceptable

If only items 1-2 are true, the work is **implemented**, not **done**.

---

## 8. Commit policy

Gemini does not decide commit boundaries.

Default policy:

- one commit per coherent workstream slice
- one cleanup commit when needed
- no “phase bundle” mega-commits

When in doubt:

- prefer smaller reviewable commits
- do not mix browser evidence, terminal hygiene, and strategy tuning in one commit

---

## 9. Suggested next concrete task

If resuming from here and the branch has already been reviewed/pushed:

### Recommended first task

**Browser evidence refinement (advisory-only)**

Narrow target:

- improve browser-side evidence capture structure
- add one or two real integration tests
- do not add hard gating

Candidate files:

- `src/server/register-tools.ts`
- `src/server/integrated-tool-evidence.test.ts`
- optionally `src/server/verification-evidence-capture.ts`

Acceptance bar:

- `typecheck` green
- browser evidence tests green
- no new hard fail path added

---

## 10. Handoff template for Gemini

Gemini should end each session with something like this:

```md
## Workstream
- Browser evidence refinement

## Files changed
- src/server/register-tools.ts
- src/server/integrated-tool-evidence.test.ts

## Validation run
- pnpm -F @proj-airi/computer-use-mcp typecheck
- pnpm -F @proj-airi/computer-use-mcp exec vitest run ...

## Behavior impact
- advisory-only

## Risks / open questions
- browser evidence still depends on foreground context, not DOM proof

## Needs Codex
- review semantics
- decide commit boundary
```

If Gemini cannot produce that cleanly, the session is not ready for Codex commit work.

