# Coding Workspace Spec Mode and Async Subagents - Design

## Overview

The first implementation splits the AIRI-native coding workspace into shared
Stage UI primitives and Tamagotchi renderer integration. Stage UI owns the pure
contracts, state machines, code-intelligence facade, tool definitions, and chat
renderers. The Tamagotchi renderer owns live chat integration, MCP bridge
adapters, compact controls, and registration into existing AIRI stores.

The design keeps normal AIRI chat as the default experience. Coding tools and
prompt contributions are registered only when coding context is enabled.

## Module Boundaries

### Shared Contracts

`packages/stage-ui/src/coding-workspace/contracts` defines the stable vocabulary
used across the feature:

- modes: `ask`, `spec`, `code`, `debug`
- spec entry paths: `requirements-first`, `design-first`, `quick-spec`
- spec phases and artifact names
- engine IDs: `native`, with reserved `acp:pi` and `acp:codex`
- subagent job status, phase, record, input, output, and provenance types
- MCP backend state and Serena read-only tool names

`packages/stage-ui/src/coding-workspace/index.ts` re-exports the contracts and
feature modules through `@proj-airi/stage-ui/coding-workspace`.

### Code Intelligence

`packages/stage-ui/src/coding-workspace/code-intelligence` provides a pure
facade over an injected transport:

- `listMcpTools()`
- `callMcpTool()`
- optional `searchFiles()`

The facade prefers Serena when read-only Serena tools are available and falls
back to generic MCP tools or local search shapes. Serena mutating tools are not
proxied through this facade.

All facade results include stable provenance fields:

- `backend`
- `serverName`
- `toolName`
- `query`
- `rawResult`

### Spec Mode

`packages/stage-ui/src/coding-workspace/spec-mode` implements the pure Spec mode
state machine. It tracks the active feature slug, entry path, active phase,
artifact approvals, allowed write directory, and canonical artifact paths.

Pair flows require approval before advancing from requirements to design and
from design to tasks. Quick spec may draft all artifacts before final execution
approval. Source-file paths and paths outside `docs/specs/<feature-slug>/` are
blocked.

### Subagent Jobs

`packages/stage-ui/src/coding-workspace/subagents` implements an in-memory
native subagent job model. Research jobs in requirements and design start as
queued. Implementation jobs start as blocked until `tasks.md` is approved.

Only the `native` engine is active in v1. `acp:pi` and `acp:codex` are reserved
identifiers and are rejected by policy.

### Tool Definitions and Prompts

`packages/stage-ui/src/coding-workspace/tools` creates xsai-compatible tool
definitions for status, code intelligence, spec artifact updates, and subagent
job updates. The tool runtime is injected by the host renderer.

The module also provides prompt contributions for Ask, Spec, Code, and Debug
modes. Spec prompt text states that source edits are blocked.

### Chat Renderers

`packages/stage-ui/src/components/scenarios/chat/components/coding-workspace`
exports compact expandable renderers for semantic search results, diagnostics,
spec phase status, subagent job status, and workspace or Serena fallback status.

The renderers are exported as a local registry so hosts can merge them into an
existing chat renderer map without changing central chat internals.

## Tamagotchi Integration

`apps/stage-tamagotchi/src/renderer/stores/coding-workspace.ts` is the renderer
store for live coding state. It tracks:

- active workspace root
- whether coding context is enabled
- coding mode
- spec entry path
- v1 engine, fixed to `native`
- MCP backend state
- Serena availability
- active spec feature slug
- in-memory subagent job store

When coding context is enabled, the store registers coding tools through
`useLlmToolsStore` and prompt contributions through
`useLlmToolsetPromptsStore`. Disabling or disposing the context clears those
registrations.

`apps/stage-tamagotchi/src/renderer/stores/mcp-tools.ts` injects the Electron
MCP bridge as the code-intelligence transport. MCP refresh updates the coding
workspace backend state:

- no tools: `unavailable`
- generic MCP tools: `available`
- read-only Serena tool group with a Serena hint or multiple read-only Serena
  tools: `serena`

Mutating Serena-only tools do not mark the backend as Serena.

`apps/stage-tamagotchi/src/renderer/components/InteractiveArea.vue` merges the
coding workspace renderer registry with the existing chat tool renderer
registry. `CodingWorkspaceControls.vue` adds compact controls to the chat
surface and exposes only native-engine v1 state.

## Data Flow

### Code Intelligence Tool Call

```text
LLM calls workspace_find_symbol
  -> coding workspace tool runtime
  -> code intelligence facade
  -> Tamagotchi MCP transport
  -> Electron MCP list/call handlers
  -> normalized result with backend provenance
  -> coding workspace chat renderer
```

### Context Enablement

```text
User enables coding context
  -> Tamagotchi coding workspace store registers tools
  -> store registers mode prompt contributions
  -> normal chat sends include coding tools while enabled
  -> user disables context
  -> registrations are cleared
```

### Subagent Job Update

```text
LLM calls workspace_create_subagent_job
  -> tool runtime checks active mode
  -> subagent job model applies engine and phase policy
  -> updated in-memory job store is saved in renderer state
  -> compact job renderer shows status in chat
```

## Error Handling

- Unsupported modes return structured tool failures instead of throwing through
  chat streaming.
- Invalid Spec mode paths return path-policy failure reasons.
- Missing MCP runtime returns an unavailable MCP result.
- Reserved ACP engines are rejected by the subagent policy.
- Spec artifact persistence is not connected in the first renderer integration;
  attempted artifact writes return a tool execution failure from the injected
  runtime.

## Test Strategy

The implementation is covered by focused tests for:

- shared contract helpers and package export contract
- Serena-preferred code-intelligence selection and fallback behavior
- Spec mode phase and path gating
- subagent lifecycle, engine gating, and provenance
- coding workspace tool names, prompt IDs, mode gating, and provenance passing
- compact chat renderer states
- Serena MCP settings template
- Tamagotchi coding workspace store and MCP backend refresh behavior

## Deferred Follow-ups

- Connect `workspace_update_spec_artifact` to AIRI-owned workspace persistence.
- Persist coding workspace state per chat session instead of keeping only
  renderer-local state.
- Add guarded filesystem, patch, terminal, and approval-backed edit tools.
- Move subagent execution from the pure in-memory job model to the native swarm
  runtime spec.
- Keep ACP/Pi/Codex subprocess support deferred until the native agent runtime
  stabilizes.
