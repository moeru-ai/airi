# Claude Code Adoption Notes

This note records what `services/computer-use-mcp` can usefully borrow from the
leaked Claude Code architecture, and what is explicitly out of scope for now.

The rule is simple:

- Borrow **structure**, not code.
- Borrow **runtime ideas**, not Anthropic-specific product baggage.
- Do not use leaked code, prompts, or closed-source implementation details as
  source material for AIRI features.

## What We Can Use Now

### 1. Tool-First Harness

Claude Code treats tools as first-class runtime objects instead of loose helper
functions. The immediate AIRI adoption is:

- preparation tools now have a small registry under
  [src/workflows/prep-tools.ts](/Users/liuziheng/airi/services/computer-use-mcp/src/workflows/prep-tools.ts)
- each prep tool has stable metadata:
  - lane
  - execution kind
  - concurrency safety
  - summary
- workflow step results now keep that metadata in `preparatoryResults` instead
  of only storing a bare tool name and raw metadata blob

This is intentionally small. It improves runtime explainability without forcing
 a full Claude-style `Tool.ts` rewrite all at once.

### 2. Minimal Prep-Execution Planning

Claude Code has a real execution harness for streamed tool calls. AIRI is not
 copying that whole system, but it is adopting the useful part:

- workflow prep advisories are now planned as explicit execution batches
- batch planning respects:
  - priority
  - reroute vs prepared outcome
  - concurrency safety

Today this is only a light batching layer for workflow prep tools, not a global
 tool executor. That is deliberate. It is small enough to use immediately and
 narrow enough to review.

### 3. Lane Separation Stays Intact

Claude Code internally has separate lanes for coding, browser, remote, and
 computer-use style behavior. AIRI keeps the same principle:

- macOS desktop lane stays separate
- browser lane stays separate
- workflow/routing/runtime logic is where orchestration belongs

This means:

- do not fold browser semantics into the macOS substrate
- do not put multi-surface orchestration logic into low-level desktop primitives

## What We Explicitly Are Not Doing Yet

### 1. No Claude-Style Giant Bootstrap

We are **not** copying the `main.tsx` pattern from Claude Code.

Reasons:

- it is too coupled
- it mixes product boot, telemetry, policy, auth, MCP, remote control, and UI
- it is not a sane shape for AIRI right now

If AIRI needs a stronger runtime shell later, it should be built
 progressively, not imported as a giant god-file pattern.

### 2. No Telemetry / Remote Managed Settings / Killswitch Stack

We are **not** importing or re-creating:

- Anthropic-style telemetry sinks
- remote managed settings
- dynamic killswitches
- feature-flag soup

Those systems are product-ops infrastructure, not the current bottleneck for
 `computer-use-mcp`.

### 3. No Direct Memory-System Port

Claude Code has:

- file-based long-term memory
- session memory extraction via background agents

That is interesting, but AIRI is **not** doing it now.

Reasons:

- current bottleneck is runtime correctness, not memory richness
- memory without a strong runtime usually becomes prompt clutter
- this would create a lot of review surface for little immediate gain

### 4. No Direct Subagent / Worktree Port Yet

Claude Code's subagent/worktree model is useful for the coding line, but it is
 still deferred here.

The current priority order remains:

1. runtime correctness
2. tool harness clarity
3. lane separation
4. verification / trace / recovery
5. only then broader agent orchestration

### 5. No Leaked-Code Derivation

This project must not:

- copy leaked source
- copy proprietary prompts
- transliterate private implementation details into "clean room" code

Allowed usage is limited to:

- architecture study
- feature inventory
- runtime pattern comparison

### 6. Runtime Snapshot Coordinator

Claude Code has a unified runtime shell that consolidates execution context
across tool invocations. AIRI now adopts this pattern in a targeted way:

- new `runtime-coordinator.ts` provides a single source of truth for runtime context
- `RuntimeSnapshot` captures all essential state: execution target, foreground context,
  display info, terminal state, browser/CDP availability, screenshots, budget, approvals
- coordinator unifies probe/refresh/aggregate logic that was scattered across files
- lightweight runtime trace events for transparency (CDP failures, surface unavailability)
- downstream consumers (action-executor, workflows) read from unified snapshot

What we borrowed:
- unified runtime shell structure
- clear query-engine boundary
- snapshot-based context passing

What we explicitly deferred:
- memory compaction system
- subagent state management
- giant bootstrap pattern
- remote managed settings
- feature-flag soup

This is the foundation for stable multi-lane coordination. Browser lane, desktop
lane, and coding lane can now operate from consistent runtime context without
rebuilding state independently.

## Current Adoption Status

The Claude-inspired changes currently adopted in this package are intentionally
 modest but structurally significant:

- prep-tool registry and metadata
- prep execution batch planning
- richer `preparatoryResults` for workflow traceability
- **runtime snapshot coordinator** (NEW) — unified runtime context layer

This is the correct scale.

The mistake would be trying to "become Claude Code" in one jump. That would
 produce a worse, more coupled `computer-use-mcp`, not a stronger one.

## Review Rule

If a future change cites Claude Code as motivation, the author should answer all
 of these before it lands:

1. What exact AIRI bottleneck does this solve?
2. Why does this need code now instead of just a note?
3. Which layer owns it: tool, runtime, lane, or orchestration?
4. What Claude Code baggage are we explicitly not importing with it?

If those answers are blurry, the change is probably not ready.
