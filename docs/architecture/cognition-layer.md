# Cognition Layer

## Overview

The cognition layer introduces AI-assisted planning to the AIRI core architecture **without surrendering execution authority to the model**. It generates plan proposals from structured context, validates them deterministically, and converts them into planner-compatible `Plan` objects for execution.

## Design Principles

### 1. Cognition is Proposal-Only

Providers produce `PlanProposal` objects — they have **no runtime or tool access**. The planner remains the sole execution authority. This is a hard architectural boundary:

- Providers cannot read files, execute commands, or modify state.
- Providers receive structured `CognitionContext` (capabilities, workspaces, history).
- Providers return serializable `CognitionResponse` (proposal + reasoning trace).

### 2. Deterministic Validation

The `PlanValidator` — not the LLM — decides whether a proposal is admissible. Validation checks are:

1. **Capability requirements**: All required capabilities must be registered and active.
2. **Workspace requirements**: All required workspaces must exist and be available.
3. **Dependency graph**: No circular dependencies; all references must resolve.
4. **Step actions**: All actions must map to registered tools.
5. **Execution constraints**: Timeouts, step counts, and parallelization limits.

### 3. Full Serializability

All cognition inputs and outputs are plain serializable objects. There is no prompt-driven hidden state:

- `CognitionRequest` carries all context explicitly.
- `CognitionResponse` includes a replayable `ReasoningTrace`.
- `PlanProposal` is immutable after creation.
- All types can be persisted via the existing persistence layer.

### 4. Replayability

Every stage of the cognition pipeline emits `AiriEvent` events:

- `cognition.requested` — request initiated
- `cognition.completed` — proposal generated
- `cognition.failed` — provider error
- `plan.proposed` — proposal created
- `plan.validated` — proposal accepted
- `plan.rejected` — proposal failed validation

These events are stored in the event store and can be replayed for auditing, debugging, and state reconstruction.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   CognitionCoordinator                   │
│                                                         │
│  1. Create CognitionRequest from context + prompt       │
│  2. Call CognitionProvider.generatePlanProposal         │
│  3. Emit cognition events                               │
│  4. Validate proposal via PlanValidator                 │
│  5. Emit validation events                              │
│  6. If valid: convert to Plan via proposalToPlan        │
│  7. Persist events if event store configured            │
└────────────┬──────────────────────┬─────────────────────┘
             │                      │
             ▼                      ▼
┌────────────────────┐  ┌──────────────────────┐
│ CognitionProvider  │  │    PlanValidator     │
│ (proposal-only)   │  │ (deterministic)      │
│                    │  │                      │
│ - generatePlan     │  │ - validate caps      │
│ - getModelInfo     │  │ - validate workspaces│
│ - isAvailable      │  │ - validate deps      │
└────────────────────┘  │ - validate actions   │
                        │ - normalize          │
                        └──────────────────────┘
```

## Components

### Types (`core/cognition/types.ts`)

Branded types and serializable structures:

- `ProposalId`, `ReasoningId`, `CognitionSessionId` — branded ID types
- `CognitionRequest` — input to a cognition provider
- `CognitionContext` — structured context (capabilities, workspaces, history)
- `CognitionResponse` — output from a provider (proposal + reasoning)
- `PlanProposal` — the core output of cognition
- `ReasoningTrace` — replayable record of cognitive reasoning
- `ValidationResult` — deterministic validation outcome

### Provider Interface (`core/cognition/provider.ts`)

Minimal interface for cognition providers:

```ts
interface CognitionProvider {
  generatePlanProposal(request, cancellationToken?): Promise<CognitionResponse>
  getModelInfo(): ModelInfo
  isAvailable(): Promise<boolean>
}
```

### Plan Validator (`core/cognition/validator.ts`)

Deterministic validation of proposals:

- Checks capability registration and availability
- Checks workspace existence and state
- Validates dependency graph (cycle detection via DFS)
- Verifies step actions map to registered tools
- Returns structured errors and warnings

### Mock Provider (`core/cognition/providers/mock-provider.ts`)

Fixture-driven provider for testing:

- Register proposals by prompt pattern
- Set a default fallback proposal
- Deterministic reasoning traces
- Supports cancellation

### Coordinator (`core/cognition/coordinator.ts`)

Orchestrates the full pipeline:

- Creates `CognitionRequest` from context
- Calls provider, emits events
- Validates proposal
- Converts accepted proposals to `Plan` objects
- Returns `CognitionPipelineResult` with full audit trail

### Persistence (`core/persistence/types.ts`)

Cognition state is included in `RuntimeSnapshot`:

- `SerializedProposal` — serializable proposal with validation result
- `SerializedReasoningTrace` — serializable reasoning trace
- `RuntimeSnapshot.proposals` — all proposals at snapshot time
- `RuntimeSnapshot.reasoningTraces` — all reasoning traces at snapshot time

Cognition events are stored as regular `AiriEvent` entries in the event store — no special handling needed.

## Usage

### Basic Pipeline

```ts
import { CognitionCoordinator, PlanValidator, MockCognitionProvider } from './core/cognition/index.js'

const provider = new MockCognitionProvider()
const validator = new PlanValidator(capabilityRegistry, workspaceManager)
const coordinator = new CognitionCoordinator(provider, validator, events, logger)

const result = await coordinator.proposePlan(
  {
    availableCapabilities: [createCapabilityId('code')],
    availableWorkspaces: [createWorkspaceId('ws-1')],
  },
  'Scan the project and identify issues',
)

if (result.accepted) {
  // result.plan is ready for the planner
  console.log(`Plan accepted: ${result.plan.name} (${result.plan.steps.length} steps)`)
} else {
  // result.validationResult contains errors
  console.log(`Plan rejected: ${result.validationResult.errors.map(e => e.message).join(', ')}`)
}
```

### Registering Fixtures (Testing)

```ts
const provider = new MockCognitionProvider()

const scanProposal = createProposal(
  createReasoningId('fixture'),
  'Project Scan',
  [
    createTestProposedStep({ id: 's1', name: 'Scan', action: 'read_file' }),
    createTestProposedStep({ id: 's2', name: 'Analyze', action: 'analyze', dependencyIds: ['s1'] }),
  ],
)

provider.registerFixture('scan', scanProposal)
```

## Known Limitations

1. **Mock provider only**: No real LLM integration yet. The `MockCognitionProvider` is fixture-driven.
2. **Single request flow**: One request → one proposal → one validation. No multi-turn or iterative refinement.
3. **No model routing**: All requests go to a single provider. Multi-model orchestration is planned for a future phase.
4. **No streaming**: Proposals are generated as complete responses. Streaming partial results is not yet supported.
5. **Basic context**: Context includes capabilities, workspaces, and summaries. Richer context (code analysis, git history) is planned.

## Future Direction

### Phase 13: Multi-Model Orchestration

- Provider registry with capability-based routing
- Fallback chains (try primary provider, fall back to secondary)
- Model selection based on task complexity
- Cost-aware routing (cheaper models for simple tasks)

### Phase 14: Iterative Refinement

- Multi-turn cognition (proposal → feedback → revision)
- Planner feedback loop (execution results inform re-planning)
- Context enrichment from execution traces

### Phase 15: Real LLM Integration

- OpenAI provider (GPT-4, GPT-4o)
- Anthropic provider (Claude)
- Local model provider (Ollama, llama.cpp)
- Streaming response support
