# Claude Code Adoption Notes

This note records what `services/computer-use-mcp` can usefully borrow from the
leaked Claude Code architecture, and what is explicitly out of scope for now.

The rule is simple:

- Borrow **structure**, not code.
- Borrow **runtime ideas**, not Anthropic-specific product baggage.
- Do not use leaked code, prompts, or closed-source implementation details as
  source material for AIRI features.

## What We Can Use Now

Before listing the adopted pieces, one architectural correction needs to stay explicit:

- `tool-first` is a useful support layer
- it is **not** the center of `computer-use-mcp`
- for AIRI, the real center should be:
  - runtime facts
  - lane contracts
  - action cycle correctness
  - verification / repair / audit

Claude-inspired structure is worth using only insofar as it strengthens those layers.

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

### 7. Tool Descriptor and Discovery Layer

The next Claude-inspired layer is now in place in a first practical form:

- a unified `ToolDescriptor` registry acts as the metadata source of truth
- public MCP registration is descriptor-driven instead of summary-string driven
- `tool_directory` exposes a compact, filterable directory of tools
- `tool_search` provides lightweight descriptor search without schema expansion
- policy and prep layers already consume descriptor metadata instead of keeping
  their own divergent copies

What we borrowed:

- compact tool exposure before full schema exposure
- fail-closed tool metadata defaults
- explicit tool lanes and kinds as runtime inputs

What we explicitly deferred:

- selective schema hydration
- LLM-ranked tool search
- prompt-cache-specific tool exposure tricks
- descriptor-driven reimplementation of every approval path in one pass
- turning tool discovery into a giant "AI picks tools for AI" layer

### 8. Search-First Retrieval Is Lane-Scoped, Not System-Scoped

Claude Code's search-first instinct is still useful, but for AIRI it belongs first to
the coding line, not the entire `computer-use-mcp` architecture.

The correct use is:

- repo / trace / task-memory retrieval for coding tools
- search-driven narrowing before reading more files
- explainable evidence instead of hidden semantic recall

The incorrect use is:

- treating retrieval as the next global architectural center
- letting retrieval outrank verification or lane handoff correctness
- smuggling a large memory/retrieval system in under the label of "Claude-inspired"

## Current Adoption Status

The Claude-inspired changes currently adopted in this package are intentionally
 modest but structurally significant:

- prep-tool registry and metadata
- prep execution batch planning
- richer `preparatoryResults` for workflow traceability
- **runtime snapshot coordinator** (NEW) — unified runtime context layer
- **tool descriptor registry + descriptor-driven registration** (NEW)
- **tool_directory + tool_search v1** (NEW)
- coding-line search-first retrieval may land as a lane-local enhancement, but it
  should not redefine the package's global architecture

## Current Phase Boundary

The current Claude-inspired phase should now be considered:

- done:
  - prep harness metadata
  - runtime snapshot coordinator
  - tool descriptor registry
  - descriptor-driven registration
  - `tool_directory`
  - `tool_search` v1
- explicitly not part of this phase:
  - `ToolExecutionRecord`
  - multi-surface routing
  - memory/subagent systems
  - schema hydration and prompt-caching tricks

The next global implementation phase should **not** start from more tool metadata work,
and it should also not treat retrieval as the new architectural center.

The better next priorities are:

1. runtime fact freshness / provenance
2. operation contract registry
3. postcondition verification / repair contract
4. lane handoff contract
5. only then broader execution-record and routing layers

`search-first retrieval` remains a valid coding-line follow-up, but it is lane-scoped
work, not the system axis for `computer-use-mcp`.

This is the correct scale.

The mistake would be trying to "become Claude Code" in one jump. That would
 produce a worse, more coupled `computer-use-mcp`, not a stronger one.

For the broader design translation, see
[`claude-code-patterns-for-airi.md`](./claude-code-patterns-for-airi.md).

## Additional Near-Term Guidance

### Operational Memory Before Big Memory

If AIRI needs memory-like behavior in the near term, prefer **operational memory**
over Claude-style long-term/session-memory systems.

Good near-term examples:

- recent failure signatures
- recent approval rejection reasons
- recent broken selector / target state
- last-known-good path for a lane-specific task

This is much cheaper and more useful for recovery than prematurely building a
general episodic or semantic memory layer.

### App Profiles Instead of App-Specific Runtime Branches

`computer-use-mcp` should avoid growing app-specific substrate logic forever.

Prefer:

- generic substrate capabilities:
  - launch
  - focus
  - observe
  - type
  - click
  - run shell
- app profiles for:
  - bundle ids
  - quirks
  - selector hints
  - verification hints
  - safe open/focus contracts

This keeps the runtime from degenerating into an app-specific rule zoo.

## Review Rule

If a future change cites Claude Code as motivation, the author should answer all
 of these before it lands:

1. What exact AIRI bottleneck does this solve?
2. Why does this need code now instead of just a note?
3. Which layer owns it: tool, runtime, lane, or orchestration?
4. What Claude Code baggage are we explicitly not importing with it?

If those answers are blurry, the change is probably not ready.
