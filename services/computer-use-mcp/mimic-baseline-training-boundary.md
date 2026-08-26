# Mimic Baseline Training Boundary

## Summary

This document defines the future training line for `computer-use-mcp`.

The current decision is deliberately conservative:

- Do not start full VLA or embodied model training now.
- Do not wire any learned model into runtime execution now.
- Do not mix this line with chafa, CLI, desktop UI pet work, or terminal coding
  workflows.
- Start with a bounded mimic baseline / learned candidate scorer experiment.

The learned component should eventually rank low-level UI candidates or actions.
It must not understand user language, execute tools, bypass approval, or decide
that a task is complete.

## Status

Current status: experiment boundary only.

This package does not currently contain a trained computer-use model. Any future
mimic scorer is advisory data until explicit runtime integration, approval, and
verification contracts are written and tested.

## Architecture Boundary

The intended division of responsibility is:

- LLM / planner handles language understanding and decomposes the user goal into
  a structured current subgoal.
- Observer provides screenshot, DOM / AX tree, candidate elements, current
  URL/title/state, and previous action trace.
- Mimic policy performs only `observation -> candidate/action ranking`.
- Runtime gate, approval discipline, action executor, and verification gate
  decide whether anything can execute.

Authority order:

```text
runtime/system rules
active user instruction
approval and safety policy
verification gate
trusted current-run tool evidence
planner subgoal / plan state
observer candidate set
mimic scorer ranking
model guess
```

The mimic scorer can inform selection. It cannot authorize execution.

## V1 Experiment Shape

If an experiment folder is created, use:

```text
services/computer-use-mcp/experiments/mimic-baseline/
```

Possible files:

```text
trace-schema.ts
collect-trace.ts
build-dataset.ts
eval-candidate-scorer.ts
README.md
```

V1 scope:

1. Define a trace schema.
2. Define observation, candidate, and action data structures.
3. Build a trace collector for deterministic browser/macOS UI tasks.
4. Save task goal, current subgoal, screenshot, DOM / AX candidates, previous
   actions, human-chosen next action, and expected effect / verification result
   when available.
5. Map human click/type/scroll actions back to candidate IDs.
6. Build a dataset builder.
7. Build an offline eval script.

Do not implement training before this substrate exists.

## Trace Schema V1 Sketch

The first schema should be append-only friendly and deterministic.

```ts
interface MimicTraceRecordV1 {
  chosenAction: MimicActionV1
  chosenCandidateId?: string
  createdAt: string
  currentSubgoal: string

  expectedEffect?: string
  mapping: {
    candidateId?: string
    distancePx?: number
    reason?: string
    status: 'ambiguous' | 'matched_candidate' | 'no_target' | 'outside_observed_bounds'
  }

  observation: {
    app?: string
    candidates: MimicCandidateV1[]
    screenshotPath?: string
    screenshotSha256?: string
    title?: string
    url?: string
    windowTitle?: string
  }

  previousActions: MimicActionV1[]
  schema: 'computer-use-mcp.mimic-trace.v1'
  source: {
    browser?: 'chrome'
    collector: 'deterministic_demo' | 'human_replay' | 'manual'
    platform: 'macos'
  }
  stepId: string

  taskGoal: string
  traceId: string

  verification?: {
    status: 'failed' | 'passed' | 'unknown'
    summary?: string
  }
}
```

Candidate and action structures should stay low-level:

```ts
type MimicActionType = 'click' | 'no_target' | 'press_key' | 'scroll' | 'type_text' | 'wait'

interface MimicActionV1 {
  candidateId?: string
  direction?: 'down' | 'left' | 'right' | 'up'
  key?: string
  point?: { x: number, y: number }
  text?: string
  type: MimicActionType
}

interface MimicCandidateV1 {
  bounds: { height: number, width: number, x: number, y: number }
  enabled?: boolean
  id: string
  label?: string
  metadata?: Record<string, unknown>
  role?: string
  source: 'ax' | 'chrome_dom' | 'manual' | 'vision'
  text?: string
  visible?: boolean
}
```

Do not put raw secrets, cookies, API keys, or full browser storage into traces.

## Dataset Builder Contract

The dataset builder should convert trace records into bounded examples:

```text
input:
  task goal
  current subgoal
  screenshot reference
  candidate list
  previous actions

label:
  chosen action type
  chosen candidate id when mapped
  no-target / unmapped status when not mapped
```

The first dataset format can be JSONL. It should keep screenshots as referenced
files, not inline base64, unless a later training backend requires packaging.

## Offline Eval Metrics

The first offline eval script should report:

- Top-1 candidate match
- Top-3 candidate match
- action type accuracy
- no-target / unmapped-action rate
- unsafe / invalid candidate rate if applicable

Eval output should be deterministic and file-based. It should not call a runtime
tool, mutate the desktop, or require a model provider key for the first schema
contract.

## Promotion Gates

Do not discuss runtime integration until all of these are true:

- at least 50 to 100 clean traces exist
- candidate extraction is stable for the target demo tasks
- human action mapping has an explainable low unmapped rate
- offline top-k metrics are repeatable
- unsafe / invalid candidate cases are measured, not hand-waved
- approval and verification boundaries remain unchanged

Even after those gates pass, a learned scorer must enter runtime as advisory
ranking only. It must not execute tools directly.

## Chika Ownership Boundary

Chika may own these bounded experiment tasks:

- collector
- schema
- deterministic browser demo task
- candidate mapping
- dataset builder
- offline eval

Chika should not own these in the first slice:

- full VLA training
- runtime execution integration
- Windows support
- terminal coding workflow integration
- model deployment
- product claims that AIRI has a trained computer-use model

## Non-Goals

- No full VLA training.
- No runtime auto-execution.
- No terminal coding workflow.
- No Windows support.
- No model deployment.
- No MCP schema changes unless strictly necessary for trace serialization.
- No desktop/chafa/CLI pet integration.
- No product claim that AIRI has a trained computer-use model.

## Reminder Trigger

When this line is reopened, remind the owner of the current decision:

```text
Do not train or deploy yet. First prove the mimic trace schema, deterministic
collector, candidate mapping, dataset builder, and offline eval.
```

Revisit the training decision only after the promotion gates above are met.
