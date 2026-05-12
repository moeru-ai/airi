# Quantum-Inspired Decision Layer for AIRI

This is an experimental design note for `computer-use-mcp`.
It is not a runtime implementation spec and it is not a claim that AIRI should use actual quantum computing.

The goal is narrower:

- keep multiple candidate actions alive until evidence is strong enough
- fuse evidence instead of summing heuristics blindly
- treat verification as an oracle, not an afterthought
- keep refusal, clarification, observation, and reroute as first-class outcomes

If this layer is later implemented, it should sit above the current task / planning / verification surfaces and below the user-visible agent loop.

## 1. Problem Statement

AIRI already has enough signals to make better decisions than "pick one plan and hope".

Today the useful signals are spread across:

- `task_memory`
- planning state
- archive recall
- workspace summary
- operational trace
- verification contracts
- lane handoff contracts
- candidate scores inside coding and desktop routing

The problem is not missing signals.
The problem is that the signals do not yet converge into one bounded decision model.

That causes predictable failures:

- a stale target can win because it looks plausible
- conflicting evidence can be ignored instead of resolved
- a risky action can be executed too early
- refusal / ask / observe can be treated like failure instead of valid outcomes
- success can be claimed before verification

This document defines a decision layer that makes those tradeoffs explicit.

## 2. Design Goals

The layer should be:

- bounded
- replayable
- evidence-driven
- verification-gated
- lane-aware
- cheap enough to run on every turn

It should not:

- replace `TaskMemory`
- replace transcript truth source
- become a second hidden planner
- auto-promote noisy summaries into durable truth
- rely on folder crawling or freeform markdown scavenging

## 3. Terminology

The "quantum-inspired" language is only a metaphor for control flow.

- `superposition` means multiple candidate actions remain alive at once
- `amplitude` means a candidate weight or score, not a real quantum amplitude
- `interference` means evidence can amplify or cancel a candidate
- `measurement` means the decision point where one action is selected
- `oracle` means a verifier or gate that marks bad / good candidates
- `annealing` means constrained search under cost and risk pressure

Do not turn this into fake quantum notation.
The point is control structure, not physics cosplay.

## 4. Decision State

A decision step should reason over a state like this:

```text
S_t = {
  goal,
  transcript,
  task_memory,
  planning_state,
  archive_recall,
  workspace_summary,
  operational_trace,
  surface_state,
  candidate_actions,
  verifier_state,
  risk_state
}
```

Candidate actions should stay open until evidence is strong enough to collapse.

Useful action classes:

- `execute`
- `observe`
- `retrieve_memory`
- `ask_clarification`
- `require_approval`
- `refuse`
- `reroute_lane`
- `wait_and_reobserve`

These are not exceptions. They are normal action-space members.

## 5. Candidate Scoring

Each candidate gets a score from evidence and penalties.

One reasonable form is:

```text
score(action) =
  + evidence_support
  + verification_support
  + expected_progress
  - risk
  - staleness
  - cost
  - contradiction
```

The score does not need to be probabilistic at first.
An argmax decision with thresholds is enough for a first version.

Useful derived values:

- `confidence`
- `entropy`
- `margin_to_runner_up`
- `risk_band`
- `verification_readiness`

If the top candidate and runner-up are too close, the system should not pretend certainty.
It should observe, retrieve, or ask.

## 6. Evidence Interference

Evidence should not be combined as a flat sum of heuristics.

Example:

- DOM says clickable
- vision says button-like
- task memory says this target was already validated
- verifier says the target is stale

In that case the verifier should suppress the candidate, even if the other signals look good.

That is the useful meaning of "interference":

- consistent evidence reinforces a candidate
- conflicting evidence weakens it
- verifier failure is not a soft suggestion
- stale memory must not overpower live evidence

This is especially relevant for:

- desktop click routing
- browser DOM vs OS fallback
- coding file selection
- success claims after tool execution

## 7. Measurement Gate

The decision should collapse only when the gate is satisfied.

Suggested gate:

```text
if confidence(top) >= threshold
and margin(top, second) >= margin_threshold
and risk(top) <= risk_threshold
and verifier_preconditions_passed:
    execute top
else if uncertainty_high:
    observe / retrieve / ask
else if risk_high:
    refuse / require approval
```

This makes refusal and clarification part of the normal policy.

The gate should be lane-aware:

- desktop lanes may require focus or browser-surface readiness
- coding lanes may require verifiable file mutation proof
- planning lanes may only project state, not mutate it

## 8. AIRI Integration Points

This layer should not invent new truths.
It should consume the facts AIRI already has.

Current useful surfaces:

- `task_memory`
  - current-run state only
- planning orchestration contract
  - plan state and authority boundaries
- archive recall
  - evidence only
- workspace summary
  - read-only durable recall
- verification contracts
  - oracle / gate layer
- lane handoff registry
  - execution surface routing
- coding primitives
  - planner candidates and mutation proof
- desktop grounding / action executor
  - effectors
- eval diagnostics
  - replay and benchmark visibility

The layer should not replace these surfaces.
It should rank and coordinate them.

## 9. Recommended Architecture

The minimum viable shape is:

```text
User goal
  -> context projection
  -> candidate builder
  -> evidence fusion
  -> verification gate
  -> action selection
  -> tool execution
  -> verifier
  -> state update
```

The most important split is:

- decision layer ranks candidates
- existing executors still do the actual work
- verifier decides whether the work was successful

That separation prevents the decision layer from becoming a hidden mutation engine.

## 10. Implementation Phases

### Phase 1: Offline scorer

Build a scorer that can rank candidate actions from replay logs.

Inputs:

- transcript
- task memory
- planning state
- archive recall
- workspace summary
- operational trace
- verifier outcome

Outputs:

- selected candidate
- score breakdown
- confidence
- entropy
- risk band
- rejection reasons

This phase must not touch runtime behavior.

### Phase 2: Shadow mode

Run the scorer alongside the real runtime.

The scorer may recommend:

- execute
- observe
- ask
- refuse
- reroute

But it does not control execution yet.

This phase is for replay comparison and false-success analysis.

### Phase 3: Narrow authority

Allow the scorer to control a very small slice first.

Good first slices:

- desktop re-observe vs execute
- coding runner continue vs stop vs require verification
- lane reroute vs keep current lane

Do not start with a broad runtime rewrite.

### Phase 4: Benchmark feedback

Only after replay looks stable should this layer be used to compare:

- false action rate
- false success rate
- clarification precision
- verification failure suppression
- decision entropy under long context

## 11. Non-Goals

This document does not propose:

- actual quantum computing
- Dirac notation
- a new long-term memory runtime
- a replacement for transcript truth source
- a replacement for `TaskMemory`
- automatic summary promotion
- folder-wide markdown scavenging by the model
- a hidden planner inside the tool router

If any implementation starts drifting into those directions, it is the wrong layer.

## 12. Success Criteria

This layer is useful only if it does at least one of the following:

- reduces false actions
- reduces false success claims
- makes refusal / ask / observe a normal result
- improves verification discipline
- makes replay and benchmark failures attributable

If it only produces nicer words for the same old heuristics, it is not worth shipping.

## 13. Open Questions

- What is the smallest lane to prototype first?
- Which verifier signals should count as hard suppression?
- How much memory evidence should be allowed into scoring before the layer becomes another planner?
- What diagnostics are required for replay to explain the selected action?

## 14. Practical Position

The right interpretation is:

- this is a candidate selection and verification layer
- it is not a new intelligence substrate
- it should be built as a toy scorer and replayable shadow mode first
- only narrow authority should follow if the replay results are better

The useful sentence is not "AIRI needs quantum algorithms".
The useful sentence is:

> AIRI needs a bounded, evidence-weighted decision layer that can collapse uncertainty only after verification gates are satisfied.
