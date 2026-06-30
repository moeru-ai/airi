# Coding Workspace Spec Mode and Async Subagents - Tasks

## Execution Contract

This task list is optimized for subagent fan-out. Each task owns a disjoint write
scope. Subagents may read any repository file, but they must not edit outside
their assigned write scope.

The fastest path is:

1. Run `T-001` first to create the shared contracts.
2. Run `T-002` through `T-007` in parallel.
3. Run `T-008` after the parallel tasks land.
4. Run `T-009` as the final verification and documentation pass.

All implementation must keep normal AIRI chat usable when no coding context is
active. Serena is the preferred MCP backend, but missing Serena must degrade
cleanly to generic MCP or local search.

## Shared Interfaces

`T-001` must define these shared concepts for all downstream tasks:

- `CodingMode`: `ask`, `spec`, `code`, `debug`
- `SpecEntryPath`: `requirements-first`, `design-first`, `quick-spec`
- `SpecPhase`: `requirements`, `design`, `tasks`
- `SpecArtifactName`: `requirements.md`, `design.md`, `tasks.md`
- `CodingEngineId`: `native`, with reserved `acp:pi` and `acp:codex`
- `SubagentJobStatus`: `queued`, `running`, `blocked`, `completed`, `failed`, `cancelled`
- `SubagentJobPhase`: `requirements`, `design`, `tasks`, `implementation`
- `McpBackendState`: `unavailable`, `available`, `serena`
- `SerenaToolName`: supported read-only Serena tool names
- `SubagentJobRecord`: phase, task description, engine, status, inputs, outputs, provenance

No downstream task may invent alternate names for these concepts.

## Parallelization Map

| Task | Can Run In Parallel | Write Scope |
| --- | --- | --- |
| `T-001` | No, run first | `packages/stage-ui/src/coding-workspace/contracts/**`, `packages/stage-ui/package.json` |
| `T-002` | After `T-001` | `apps/stage-tamagotchi/src/renderer/pages/settings/modules/mcp*`, `apps/stage-tamagotchi/src/renderer/pages/settings/modules/components/Mcp*`, `packages/i18n/src/locales/en/settings.yaml` |
| `T-003` | After `T-001` | `packages/stage-ui/src/coding-workspace/code-intelligence/**` |
| `T-004` | After `T-001` | `packages/stage-ui/src/coding-workspace/spec-mode/**` |
| `T-005` | After `T-001` | `packages/stage-ui/src/coding-workspace/subagents/**` |
| `T-006` | After `T-001` | `packages/stage-ui/src/coding-workspace/tools/**` |
| `T-007` | After `T-001` | `packages/stage-ui/src/components/scenarios/chat/components/coding-workspace/**` |
| `T-008` | After `T-002` through `T-007` | `apps/stage-tamagotchi/src/renderer/stores/coding-workspace*`, `apps/stage-tamagotchi/src/renderer/components/coding-workspace/**`, `apps/stage-tamagotchi/src/renderer/App.vue`, `apps/stage-tamagotchi/src/renderer/components/InteractiveArea.vue`, `apps/stage-tamagotchi/src/renderer/stores/mcp-tools*` |
| `T-009` | Last | `docs/architecture/coding-workspace.md`, `docs/specs/coding-workspace-spec-mode-and-subagents/**`, `docs/ai/context/ui-components.md` if UI primitives changed |

## Tasks

- [ ] `T-001` - Shared Coding Workspace Contracts
- [ ] `T-002` - Serena MCP Settings Template
- [ ] `T-003` - Serena-Preferred Code Intelligence Facade
- [ ] `T-004` - Spec Mode Artifact State Machine
- [ ] `T-005` - Async Native Subagent Job Model
- [ ] `T-006` - Coding Workspace Tool Definitions and Prompt Contributions
- [ ] `T-007` - Chat Renderers for Coding Workspace Results
- [ ] `T-008` - Tamagotchi Renderer Integration
- [ ] `T-009` - Final Verification and Documentation Sync

### T-001 - Shared Coding Workspace Contracts

**Goal:** Create stable TypeScript contracts that all other tasks import instead
of duplicating coding workspace, Serena, spec, and subagent types.

**Write Scope:**

- `packages/stage-ui/src/coding-workspace/contracts/**`
- `packages/stage-ui/src/coding-workspace/index.ts`
- `packages/stage-ui/src/coding-workspace/contracts.test.ts`
- `packages/stage-ui/package.json`

**Deliverables:**

- Export the shared interfaces listed in "Shared Interfaces".
- Add pure helpers:
  - `isSpecMode(mode: CodingMode): boolean`
  - `isV1Engine(engine: CodingEngineId): boolean`
  - `artifactNameForPhase(phase: SpecPhase): SpecArtifactName`
  - `nextSpecPhase(phase: SpecPhase): SpecPhase | undefined`
  - `isSerenaReadOnlyTool(toolName: string): toolName is SerenaToolName`
- Add a package export so app code can import the contracts from
  `@proj-airi/stage-ui/coding-workspace`.

**Tests:**

- `pnpm exec vitest run packages/stage-ui/src/coding-workspace/contracts.test.ts`
- Cover phase-to-artifact mapping, next phase order, v1 engine detection, and
  rejection of Serena mutating tools such as `replace_symbol_body`.

**Completion Report Must Include:**

- Export path added.
- Public types and helpers created.
- Test command and result.

### T-002 - Serena MCP Settings Template

**Goal:** Add a predefined Serena MCP server template to the existing MCP
settings flow, with explicit `uv` prerequisite guidance and setup link.

**Write Scope:**

- `apps/stage-tamagotchi/src/renderer/pages/settings/modules/mcp-config.ts`
- `apps/stage-tamagotchi/src/renderer/pages/settings/modules/mcp-config.test.ts`
- `apps/stage-tamagotchi/src/renderer/pages/settings/modules/mcp.vue`
- `apps/stage-tamagotchi/src/renderer/pages/settings/modules/components/McpServerForm.vue`
- `apps/stage-tamagotchi/src/renderer/pages/settings/modules/components/McpConnectionTestPanel.vue`
- `packages/i18n/src/locales/en/settings.yaml`

**Deliverables:**

- Add `createSerenaServerForm()` or an equivalent helper returning a server row
  with:
  - identifier: `serena`
  - command: `uvx`
  - args:
    - `--from`
    - `git+https://github.com/oraios/serena`
    - `serena`
    - `start-mcp-server`
    - `--context`
    - `ide-assistant`
  - enabled: `true`
- Add a "Serena" preset action in the MCP settings page that inserts the
  template without overwriting existing server rows.
- Show setup guidance near the preset:
  - `uv` must be available on `PATH`.
  - Link to `https://github.com/oraios/serena`.
  - Users should test and restart through AIRI's normal MCP flow.
- Preserve current raw JSON editing behavior.

**Tests:**

- `pnpm exec vitest run apps/stage-tamagotchi/src/renderer/pages/settings/modules/mcp-config.test.ts`
- Cover template shape, duplicate handling when `serena` already exists, and
  round-trip conversion through `buildConfigFile()`.

**Completion Report Must Include:**

- Exact Serena template command and args chosen.
- User-visible setup link.
- Test command and result.

### T-003 - Serena-Preferred Code Intelligence Facade

**Goal:** Build a pure code-intelligence facade that prefers Serena MCP tools
and falls back to generic MCP/local search shapes without exposing Serena
mutating tools directly.

**Write Scope:**

- `packages/stage-ui/src/coding-workspace/code-intelligence/**`

**Deliverables:**

- Define a runtime-agnostic transport interface:
  - `listMcpTools(): Promise<McpToolSummary[]>`
  - `callMcpTool(input: McpToolCall): Promise<McpToolResult>`
  - optional `searchFiles(input: LocalSearchInput): Promise<LocalSearchResult[]>`
- Add facade methods matching the architecture:
  - `workspace_get_symbols_overview`
  - `workspace_find_symbol`
  - `workspace_find_declaration`
  - `workspace_find_references`
  - `workspace_get_diagnostics`
  - `workspace_search_pattern`
  - `workspace_ranked_context`
- Detect a Serena backend by available read-only tool names:
  - `get_symbols_overview`
  - `find_symbol`
  - `find_declaration`
  - `find_referencing_symbols`
  - `get_diagnostics_for_file`
  - `search_for_pattern`
- Refuse to proxy Serena mutating tools:
  - `replace_symbol_body`
  - `insert_before_symbol`
  - `insert_after_symbol`
  - `rename_symbol`
  - `safe_delete_symbol`
- Normalize all results into stable serializable result objects with provenance:
  `backend`, `serverName`, `toolName`, `query`, `rawResult`.

**Tests:**

- `pnpm exec vitest run packages/stage-ui/src/coding-workspace/code-intelligence`
- Cover Serena selection, fallback behavior, provenance recording, mutating tool
  rejection, and `workspace_ranked_context` aggregation.

**Completion Report Must Include:**

- Facade method list.
- Serena tool mapping.
- Test command and result.

### T-004 - Spec Mode Artifact State Machine

**Goal:** Implement pure Spec mode planning rules for requirements-first,
design-first, and quick spec flows.

**Write Scope:**

- `packages/stage-ui/src/coding-workspace/spec-mode/**`

**Deliverables:**

- Add a pure state machine for:
  - active feature slug
  - entry path
  - active phase
  - artifact approval state
  - allowed write paths under `docs/specs/<feature-slug>/`
- Enforce:
  - Spec mode writes only inside its active feature spec directory.
  - Pair flows require approval before requirements-to-design and
    design-to-tasks transitions.
  - Design-first must backfill or confirm `requirements.md` before tasks are
    execution-ready.
  - Quick spec may draft all artifacts before final execution approval.
- Add artifact path helpers for `requirements.md`, `design.md`, and `tasks.md`.

**Tests:**

- `pnpm exec vitest run packages/stage-ui/src/coding-workspace/spec-mode`
- Cover all three entry paths, approval gates, path validation, and blocked
  source-file writes in Spec mode.

**Completion Report Must Include:**

- Supported entry paths.
- Approval and path-gating behavior.
- Test command and result.

### T-005 - Async Native Subagent Job Model

**Goal:** Add the native async subagent job model used by requirements/design
research and post-tasks implementation assignment.

**Write Scope:**

- `packages/stage-ui/src/coding-workspace/subagents/**`

**Deliverables:**

- Add a pure job store/model for `SubagentJobRecord` creation and lifecycle
  transitions.
- Record for each job:
  - phase
  - task description
  - engine
  - status
  - inputs
  - outputs
  - provenance
- Enforce:
  - Research jobs may run during `requirements` and `design`.
  - Implementation jobs may run only after approved `tasks.md` exists.
  - V1 jobs use `native`; `acp:pi` and `acp:codex` are reserved but inactive.
- Add helpers to attach Serena/MCP provenance to job outputs.

**Tests:**

- `pnpm exec vitest run packages/stage-ui/src/coding-workspace/subagents`
- Cover lifecycle transitions, blocked implementation before approved tasks,
  v1 engine gating, and provenance attachment.

**Completion Report Must Include:**

- Job lifecycle states implemented.
- Engine gating behavior.
- Test command and result.

### T-006 - Coding Workspace Tool Definitions and Prompt Contributions

**Goal:** Define AIRI-native coding workspace tools and prompt contributions
without wiring them into the live renderer yet.

**Write Scope:**

- `packages/stage-ui/src/coding-workspace/tools/**`

**Deliverables:**

- Add xsai-compatible tool definitions for:
  - `workspace_status`
  - `workspace_get_symbols_overview`
  - `workspace_find_symbol`
  - `workspace_find_declaration`
  - `workspace_find_references`
  - `workspace_get_diagnostics`
  - `workspace_search_pattern`
  - `workspace_ranked_context`
  - `workspace_update_spec_artifact`
  - `workspace_create_subagent_job`
  - `workspace_update_subagent_job`
- Route code-intelligence tools through the facade from `T-003`.
- Route Spec mode artifact and subagent tools through the pure models from
  `T-004` and `T-005`.
- Add prompt contribution text for `Ask`, `Spec`, `Code`, and `Debug` modes.
- Ensure Spec mode prompt text states that source edits are blocked.

**Tests:**

- `pnpm exec vitest run packages/stage-ui/src/coding-workspace/tools`
- Cover tool schema names, mode-based gating, prompt text inclusion, and Serena
  provenance passing.

**Completion Report Must Include:**

- Tool names exposed.
- Prompt contribution IDs.
- Test command and result.

### T-007 - Chat Renderers for Coding Workspace Results

**Goal:** Build compact chat renderer components for coding workspace tool
results without modifying the central chat entrypoint.

**Write Scope:**

- `packages/stage-ui/src/components/scenarios/chat/components/coding-workspace/**`

**Deliverables:**

- Add renderer components for:
  - semantic search and symbol results
  - diagnostics
  - spec phase status
  - subagent job status
  - Serena unavailable/fallback notices
- Export a local renderer registry object keyed by workspace tool names.
- Keep cards compact, expandable, and compatible with the existing
  `ChatToolCallRendererProps` contract.
- Ensure renderer copy is silent/visual by default and does not instruct the
  user how to use the feature.

**Tests:**

- `pnpm exec vitest run packages/stage-ui/src/components/scenarios/chat/components/coding-workspace`
- Cover renderer props for executing, done, and error states.

**Completion Report Must Include:**

- Renderer names and tool keys.
- Accessibility or compactness notes.
- Test command and result.

### T-008 - Tamagotchi Renderer Integration

**Goal:** Wire the parallel pieces into the existing Tamagotchi chat runtime
while keeping normal chat unobstructed.

**Write Scope:**

- `apps/stage-tamagotchi/src/renderer/stores/coding-workspace.ts`
- `apps/stage-tamagotchi/src/renderer/stores/coding-workspace.test.ts`
- `apps/stage-tamagotchi/src/renderer/components/coding-workspace/**`
- `apps/stage-tamagotchi/src/renderer/App.vue`
- `apps/stage-tamagotchi/src/renderer/components/InteractiveArea.vue`
- `apps/stage-tamagotchi/src/renderer/stores/mcp-tools.ts`
- `apps/stage-tamagotchi/src/renderer/stores/mcp-tools.test.ts`

**Deliverables:**

- Add a Tamagotchi renderer store that tracks:
  - active workspace root
  - coding context enabled or disabled
  - coding mode
  - Spec entry path
  - v1 engine `native`
  - MCP backend state with Serena availability
- Register coding workspace tools through `useLlmToolsStore`.
- Register coding prompt contributions through `useLlmToolsetPromptsStore`.
- Merge the coding workspace renderer registry into the chat tool renderer
  registry passed by `InteractiveArea.vue`.
- Add compact coding controls that are inactive unless coding context is
  selected.
- Extend MCP refresh behavior so Serena availability can update coding backend
  status after MCP tools refresh.

**Tests:**

- `pnpm exec vitest run apps/stage-tamagotchi/src/renderer/stores/coding-workspace.test.ts apps/stage-tamagotchi/src/renderer/stores/mcp-tools.test.ts`
- Cover disabled-by-default behavior, tool/prompt registration when enabled,
  coding mode changes, and Serena status updates from MCP tool listings.

**Completion Report Must Include:**

- Entry points modified.
- Default chat behavior confirmation.
- Test command and result.

### T-009 - Final Verification and Documentation Sync

**Goal:** Verify the implementation as one feature and update docs affected by
new coding workspace controls or UI primitives.

**Write Scope:**

- `docs/architecture/coding-workspace.md`
- `docs/specs/coding-workspace-spec-mode-and-subagents/tasks.md`
- `docs/specs/coding-workspace-spec-mode-and-subagents/design.md`
- `docs/ai/context/ui-components.md` only if new shared UI primitives were
  added or existing shared UI primitives changed.

**Deliverables:**

- Add or update `design.md` only after implementation details are known.
- Update architecture notes only if the implemented shape differs from the
  current architecture doc.
- Confirm task IDs and completion states in this file.
- Record any deferred follow-up tasks explicitly.

**Verification Commands:**

- `pnpm exec vitest run packages/stage-ui/src/coding-workspace`
- `pnpm exec vitest run packages/stage-ui/src/components/scenarios/chat/components/coding-workspace`
- `pnpm exec vitest run apps/stage-tamagotchi/src/renderer/pages/settings/modules/mcp-config.test.ts`
- `pnpm exec vitest run apps/stage-tamagotchi/src/renderer/stores/coding-workspace.test.ts apps/stage-tamagotchi/src/renderer/stores/mcp-tools.test.ts`
- `pnpm -F @proj-airi/stage-ui typecheck`
- `pnpm -F @proj-airi/stage-tamagotchi typecheck`

**Completion Report Must Include:**

- All verification commands and outcomes.
- Any tasks not completed.
- Any follow-up work needed before ACP or swarm runtime integration.
