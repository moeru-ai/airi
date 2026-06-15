# Semantic Memory & Repository Intelligence

## Overview

The semantic memory system provides explicit, deterministic long-term memory for the AIRI platform. Unlike prompt-based hidden state, all memory is structured, serializable, and auditable.

**Key principles:**
- No AI/autonomous reasoning — memory is explicit and deterministic
- All relevance scoring is heuristic-based (no ML models)
- Memory is purely additive — existing contracts are preserved
- Worker isolation is maintained — no global singletons

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cognition Layer                         │
│  CognitionCoordinator                                       │
│    ├── MemoryRetriever.retrieveForContext()                │
│    │     ├── MemoryRegistry.query()                         │
│    │     ├── RepositoryIntelligence.getFileContext()         │
│    │     ├── DecisionMemory.getDecisions()                  │
│    │     └── FailureMemory.detectPatterns()                 │
│    └── DecisionMemory.recordDecision()                     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
│MemoryRegistry│  │RepositoryIntelli-│  │ DecisionMemory   │
│              │  │gence             │  │ FailureMemory    │
│ query()      │  │ indexRepository()│  │ recordDecision() │
│ register()   │  │ findRelatedFiles│  │ recordFailure()  │
│ update()     │  │ getDependencyChain│ │ detectPatterns() │
│ remove()     │  │ getAffectedFiles │  │                  │
└──────────────┘  └──────────────────┘  └──────────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
              ┌──────────────────────────┐
              │   Persistence Layer      │
              │   SnapshotManager        │
              │   ├── captureMemories()  │
              │   ├── captureRetrievals()│
              │   └── captureRepoMaps()  │
              └──────────────────────────┘
```

## Type System

### Branded IDs

All memory identifiers use branded types for type safety:

```typescript
type MemoryId = string & { readonly __brand: 'MemoryId' }
type RetrievalId = string & { readonly __brand: 'RetrievalId' }
type RepositoryMapId = string & { readonly __brand: 'RepositoryMapId' }
```

Factory functions ensure brand safety at creation sites:
- `createMemoryId(raw: string): MemoryId`
- `createRetrievalId(raw: string): RetrievalId`
- `createRepositoryMapId(raw: string): RepositoryMapId`

### Memory Scopes

| Scope | Description |
|-------|-------------|
| `global` | Available across all sessions and workspaces |
| `session` | Tied to a specific cognition session |
| `workspace` | Scoped to a specific workspace |
| `repository` | Scoped to a specific repository |

### Memory Types

| Type | Description |
|------|-------------|
| `decision` | Records a decision made during plan generation |
| `failure` | Records an execution failure |
| `architecture` | Describes architectural knowledge |
| `pattern` | Captures recurring patterns |
| `context` | General contextual information |

## Relevance Scoring Algorithm

The `MemoryRegistry.query()` method uses deterministic heuristic scoring:

1. **Exact text match** in title/content: score 1.0
2. **Reference overlap**: +0.3 per matching reference
3. **Scope match**: +0.2
4. **Type match**: +0.1
5. **Importance weighting**: multiply by (0.5 + 0.5 * importance)
6. **Recency boost**: +0.1 if accessed within last 24h
7. **Access frequency**: +0.05 * min(accessCount, 10)

Maximum score is capped at 2.0.

## Repository Intelligence

`RepositoryIntelligence` builds a structural map of a repository:

- **File graph**: Nodes represent files, edges represent imports
- **Architecture nodes**: Identified by directory structure and package.json/tsconfig.json
- **Git metadata**: Branch, commit, remote, contributors
- **Multi-language import parsing**: Supports .ts, .js, .tsx, .jsx, .py, .rs, .go, .java, .kt, .swift

### Capabilities

- `findRelatedFiles(path, maxDepth)`: BFS on import graph
- `getDependencyChain(path)`: Topological import order
- `getAffectedFiles(changedPaths)`: Reverse dependency lookup
- `getFileContext(path)`: Full context (node, file, imports, importedBy)

## Decision & Failure Memory

### DecisionMemory

Records decisions made during plan generation:
- Accepted, rejected, or revised proposals
- Validation results
- Outcome tracking (what actually happened)

### FailureMemory

Records execution failures with pattern detection:
- Groups failures by normalized error signature
- Creates patterns when 3+ failures share a signature
- Suggests actions based on pattern type (timeout, permission, network, etc.)

## Retrieval Context Assembly

`MemoryRetriever` assembles context for cognition:

```
## Semantic Memory Context

### Relevant Memories
[1] (decision, 0.95) Fix authentication middleware — accepted proposal for JWT refresh
[2] (failure, 0.87) Workspace corruption on concurrent access — pattern: workspace_race_condition

### Repository Context
- Branch: main (abc123)
- Relevant files: src/auth/middleware.ts, src/auth/jwt.ts

### Decision History
- Last 3 decisions: 2 accepted, 1 rejected (capability mismatch)
- Known failure patterns: workspace_race_condition (3 occurrences)
```

## Cognition Integration

The `CognitionCoordinator` integrates memory retrieval into the cognition pipeline:

1. **Before provider call**: `MemoryRetriever.retrieveForContext()` populates `CognitionContext.memoryContext`
2. **After proposal generation**: `DecisionMemory.recordDecision()` records the outcome
3. **Events emitted**: `memory.retrieved`, `decision.recorded` for auditing

Memory retrieval failure does not block cognition — it's a best-effort enrichment.

## Persistence and Recovery

Memory state is included in `RuntimeSnapshot`:

```typescript
interface RuntimeSnapshot {
  // ... existing fields ...
  readonly memories: SerializedMemoryRecord[]
  readonly retrievalTraces: SerializedRetrievalTrace[]
  readonly repositoryMaps: SerializedRepositoryMap[]
}
```

`SnapshotManager` provides capture functions:
- `setCaptureMemories(fn: () => SerializedMemoryRecord[]): void`
- `setCaptureRetrievalTraces(fn: () => SerializedRetrievalTrace[]): void`
- `setCaptureRepositoryMaps(fn: () => SerializedRepositoryMap[]): void`

## Event Types

Eight new event types are added to the `AiriEvent` union:

| Event | Emitted When |
|-------|-------------|
| `memory.stored` | A memory record is stored |
| `memory.retrieved` | Memories are retrieved for context |
| `memory.updated` | A memory record is updated |
| `memory.removed` | A memory record is removed |
| `repository.indexed` | A repository is indexed |
| `decision.recorded` | A decision is recorded |
| `failure.recorded` | A failure is recorded |
| `failure.pattern.detected` | A recurring failure pattern is detected |

## Design Decisions and Trade-offs

1. **Deterministic scoring over ML**: Heuristic scoring is predictable and auditable. ML-based scoring would introduce non-determinism.

2. **InMemory storage**: All memory classes use in-memory Maps. External persistence is handled via snapshots, not direct database writes.

3. **No singleton pattern**: All classes are instantiated via constructor injection, following the existing DI pattern.

4. **Optional memory context**: Memory retrieval is optional in cognition. If the retriever is not configured, cognition proceeds without memory.

5. **Pattern detection threshold**: 3+ occurrences required to create a pattern. This balances sensitivity with noise reduction.

6. **Import parsing**: Supports common import patterns for major languages. Does not use AST parsing — regex-based parsing is sufficient for graph construction.

7. **Content hashing**: `RepositoryScanner` uses polynomial rolling hash for change detection. Not cryptographically secure, but sufficient for detecting file changes.
