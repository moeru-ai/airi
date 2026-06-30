# AIRI Core - Coding Workspace

## Overview

The coding workspace is an AIRI-native coding-agent surface hosted inside the
existing chat window. It revives the useful parts of Roo-style coding agents
without porting Roo's VS Code extension architecture or legacy transcript
model.

The core idea is simple:

- AIRI owns the chat UI, session history, tool rendering, workspace policy, and
  approvals.
- MCP servers provide external code-intelligence capabilities, with Serena as
  the preferred semantic backend when available.
- Native AIRI tools provide guarded filesystem, terminal, patch, and task-list
  actions.
- ACP-compatible agents such as Pi or Codex can be attached later as subprocess
  engines, while still streaming through AIRI's native chat timeline.

This keeps AIRI as the host operating system for the coding experience. External
agents and MCP servers become replaceable backends, not competing renderers.

## Goals

1. Add a coding mode to AIRI's existing chat window.
2. Use AIRI's upstream MCP runtime for code intelligence instead of building a
   one-off code search stack.
3. Prefer Serena MCP for semantic operations: symbol lookup, declarations,
   references, diagnostics, and targeted source retrieval.
4. Keep all file edits, command execution, and approvals under AIRI-owned
   policy.
5. Make Pi/Codex ACP integration possible without making either one the
   foundation of the native coding workspace.
6. Preserve the existing chat message model, including tool-call slices and
   custom tool renderers.

## Non-Goals

- Do not port Roo's VS Code host, webview UI, or legacy XML-style tool parser.
- Do not give MCP servers direct authority to mutate files without AIRI approval.
- Do not make Pi or any ACP agent the only coding engine.
- Do not build a separate renderer for coding-agent output.
- Do not replace AIRI's existing MCP settings/runtime with a fork-specific
  product direction.

## Current AIRI Fit

The repository already has most of the required host primitives:

- `packages/core-agent/src/runtime/chat-orchestrator-runtime.ts` streams chat
  messages and emits tool-call/tool-result slices.
- `packages/stage-ui/src/stores/llm-tools.ts` registers runtime tools from
  multiple providers.
- `packages/stage-ui/src/stores/llm.ts` merges built-in, MCP, plugin, and custom
  runtime tools before provider calls.
- `apps/stage-tamagotchi/src/main/services/airi/mcp-servers/index.ts` manages
  MCP stdio server lifecycle, tool listing, tool calls, config, status, and
  testing.
- `apps/stage-tamagotchi/src/renderer/stores/mcp-tools.ts` registers the
  Electron-backed MCP bridge into the shared LLM tool store.
- `apps/stage-tamagotchi/src/renderer/components/InteractiveArea.vue` already
  passes a tool renderer registry into the chat history component.
- `core/workspace` and `core/capabilities` define workspace leases, capability
  descriptors, and structured tool execution contracts.

The coding workspace should use these paths instead of introducing a parallel
agent runtime.

## Architecture

```text
Chat Window
  |
  | user message + selected coding mode
  v
Chat Orchestrator Runtime
  |
  | active tool set + prompt contributions
  v
Coding Workspace Module
  |
  |-- Code Intelligence Facade
  |     |-- Serena MCP adapter preferred
  |     |-- generic MCP adapter fallback
  |     `-- local search fallback
  |
  |-- Workspace Tool Provider
  |     |-- read_file
  |     |-- list_files
  |     |-- apply_patch
  |     |-- write_file
  |     |-- run_command
  |     |-- read_command_output
  |     `-- update_todo
  |
  |-- Approval and Policy Gate
  |     |-- mode restrictions
  |     |-- path sandbox
  |     |-- diff approvals
  |     `-- command approvals
  |
  `-- Optional ACP Engine Adapter
        |-- Pi subprocess
        |-- Codex subprocess
        `-- other ACP-compatible agents
```

The model sees stable AIRI-native coding tools. Internally, those tools may call
Serena MCP, generic MCP, local filesystem functions, or an ACP subprocess. The
chat UI does not need to know which backend served the request.

## Coding Module

The coding module is a Stage/Tamagotchi module similar in placement to
consciousness, hearing, vision, and other runtime modules.

It owns:

- active coding workspace root
- selected coding mode
- selected engine: native, ACP Pi, ACP Codex, or future engines
- MCP backend preference
- approval policy
- command allowlist
- tool renderer registrations
- prompt contributions for coding modes

The module should register tools through `useLlmToolsStore` and prompt
contributions through `useLlmToolsetPromptsStore`, matching the existing plugin
and MCP tool patterns.

Coding state should attach to the active chat session where possible. AIRI
already has a session store, session metadata, and a sessions drawer, so the
coding module should not introduce a parallel conversation model. When the
user is having a normal conversation, coding controls stay compact and inactive
unless a workspace or coding mode is selected.

## Modes

Modes are AIRI-owned. They control tool availability and prompt policy.

### Ask

Purpose: answer questions and inspect code.

Allowed:

- semantic search
- symbol lookup
- references
- diagnostics
- file reads
- file listing

Blocked:

- file edits
- command execution
- direct task delegation

### Spec

Purpose: plan changes through Kiro-style spec artifacts:
`requirements.md`, `design.md`, and `tasks.md`.

Allowed:

- all Ask tools
- todo updates
- markdown spec edits under `docs/specs/<feature-slug>/`

Blocked by default:

- source edits
- command execution

### Code

Purpose: implement changes.

Allowed:

- all Ask and Spec tools
- patch proposal and application
- file writes
- command execution

Gates:

- edits require diff approval initially
- commands require approval initially
- outside-workspace writes are rejected

### Debug

Purpose: investigate failures and verify hypotheses.

Allowed:

- all Ask tools
- diagnostics
- command execution with approval
- patch proposal

Gates:

- source edits require explicit approval
- command output is captured and summarized when large

## MCP and Serena

MCP should be treated as a first-class substrate. The existing Electron MCP
runtime remains the lifecycle owner for stdio servers.

Serena is an external dependency and should not be silently installed. The MCP
settings page should provide a predefined Serena server template with a link to
Serena's setup documentation and a clear prerequisite that `uv` must be
available on `PATH`. Users can then test and enable the server through AIRI's
normal MCP config flow.

The coding workspace adds a semantic facade over MCP:

```text
workspace_get_symbols_overview
workspace_find_symbol
workspace_find_declaration
workspace_find_references
workspace_get_diagnostics
workspace_search_pattern
workspace_ranked_context
```

When Serena is configured and running, the facade maps these tools to Serena
calls:

- `get_symbols_overview`
- `find_symbol`
- `find_declaration`
- `find_referencing_symbols`
- `get_diagnostics_for_file`
- `search_for_pattern`

Serena mutating tools are deliberately not exposed as direct model tools in the
first milestone:

- `replace_symbol_body`
- `insert_before_symbol`
- `insert_after_symbol`
- `rename_symbol`
- `safe_delete_symbol`

Those operations may be used later to produce edit proposals, but AIRI should
still apply final changes through its own patch and approval pipeline.

If Serena is unavailable, the facade falls back to generic MCP or local tools:

- `rg` for text search
- file-outline heuristics for basic symbol summaries
- TypeScript/Vue diagnostics only when a local implementation is available

Fallback output must keep the same shape as the Serena-backed path so prompts,
renderers, and tests stay stable.

## Generic MCP Escape Hatch

The existing generic MCP tools should remain available:

- `builtIn_mcpListTools`
- `builtIn_mcpCallTool`

They are useful for discovery and non-coding MCP servers. Coding workflows,
however, should prefer stable AIRI workspace tools over raw model-selected MCP
tool names. This avoids brittle prompts such as requiring the model to call
`builtIn_mcpCallTool` with a serialized JSON argument for every code lookup.

## Workspace Tools

The workspace tool provider exposes guarded tools with AIRI-owned semantics.

### Read Tools

- `workspace_status`: current root, git branch, mode, engine, MCP backend state
- `workspace_list_files`: list files under the workspace root
- `workspace_read_file`: read line ranges or whole small files
- `workspace_search_files`: text search under the workspace root

### Code Intelligence Tools

- `workspace_get_symbols_overview`
- `workspace_find_symbol`
- `workspace_find_declaration`
- `workspace_find_references`
- `workspace_get_diagnostics`
- `workspace_search_pattern`
- `workspace_ranked_context`

`workspace_ranked_context` is a composed helper that can use Serena symbols,
references, and pattern search when available, then fall back to local search
results when needed.

### Edit Tools

- `workspace_apply_patch`: apply an AIRI-owned patch format after approval
- `workspace_write_file`: create or overwrite files after approval
- `workspace_update_todo`: update the visible task list

### Terminal Tools

- `workspace_run_command`: run a command with an explicit working directory
- `workspace_read_command_output`: read full output from stored command artifacts

Commands should run through Electron main or a core workspace runtime, not the
renderer. Long-running commands are captured as artifacts and summarized in chat.

## Approval and Authority

The approval gate is the main safety boundary.

Policy rules:

- All paths resolve against the active workspace root.
- Reads inside the workspace may auto-run.
- Writes outside the workspace are rejected.
- Commands require approval unless explicitly allowlisted.
- Edits produce a diff and wait for approval before applying.
- MCP mutating tools are disabled or converted into proposed edits.
- ACP subprocess requests are normalized into AIRI tool requests before
  execution where possible.

The same approval gate should serve native tools, MCP-backed tools, and ACP
engines. This prevents multiple authority systems from diverging.

## ACP Engine Adapter

ACP is an interoperability layer for external coding agents. It lets AIRI host
Pi, Codex, or other agents as subprocesses while preserving AIRI's native chat
surface.

The adapter owns:

- process lifecycle
- session creation
- request/response streaming
- conversion from ACP events into AIRI chat slices
- conversion from ACP action requests into AIRI approval/tool requests
- cancellation and shutdown

The ACP adapter does not own:

- chat UI
- persistent AIRI chat history
- MCP configuration
- final filesystem authority
- approval decisions

Engine selection belongs in the coding module settings:

- `Native`
- `ACP: Pi`
- `ACP: Codex`

The first implementation can ship without ACP, but the native tool/event model
should be designed so ACP can plug in without a rewrite.

## Chat UI

The existing chat timeline remains the only visible transcript.

Coding mode must integrate into the vanilla AIRI chat window without
obstructing normal conversation. The default experience remains regular chat;
workspace controls appear as a compact strip or drawer only when the user opts
into coding context.

Additions:

- coding mode selector
- active workspace indicator
- engine selector/status
- MCP backend status, including Serena availability
- compact todo/task panel or inline todo tool renderer
- custom tool renderers for:
  - semantic search results
  - file reads
  - diffs
  - command execution
  - diagnostics
  - ACP subprocess events

The UI should not render a second Roo/Pi/Codex transcript. External events are
normalized into AIRI message slices.

## Data Flow

### Native Coding Turn

```text
User sends message
  -> chat orchestrator composes prompt with active coding mode
  -> LLM calls AIRI workspace tools
  -> tools route to Serena MCP, filesystem, terminal, or patch backend
  -> approval gate pauses edits/commands when needed
  -> tool results stream into chat slices
  -> final assistant response persists in AIRI chat session
```

### Serena Search

```text
workspace_find_symbol
  -> code intelligence facade
  -> MCP runtime list/status check
  -> Serena MCP call
  -> normalized symbol result
  -> chat tool renderer
```

### ACP Turn

```text
User sends message with engine = ACP: Pi
  -> ACP adapter starts or reuses subprocess session
  -> subprocess streams events
  -> adapter maps text to assistant slices
  -> adapter maps action requests to AIRI tools/approvals
  -> final output persists in AIRI chat session
```

## Persistence

Persist at least:

- active workspace root for each chat session that has coding enabled
- selected mode for each coding-enabled chat session
- selected engine for each coding-enabled chat session
- command artifacts and summaries
- approval decisions that are safe to remember
- todo state

Do not persist secrets from MCP configs or subprocess environment variables into
chat messages.

## Testing Strategy

Core tests:

- mode-to-tool gating
- path sandbox validation
- edit approval flow
- command approval flow
- Serena adapter normalization
- fallback search normalization
- ACP event normalization

Renderer tests:

- coding mode selector state
- tool renderer states: executing, done, error
- diff approval display
- command output display

Electron main tests:

- MCP status/list/call integration for the coding facade
- command execution artifact capture
- workspace root validation

Contract tests:

- ACP adapter event mapping
- MCP facade output shapes
- persisted session metadata migration

## Milestones

### Milestone 1 - Native Coding Workspace

- Add coding module settings and active mode state.
- Register AIRI workspace tools.
- Add Serena-preferred code intelligence facade.
- Add custom chat renderers for file/search/diagnostic/diff/command output.
- Gate edits and commands with approval.

### Milestone 2 - MCP Hardening

- Improve MCP status visibility in chat/settings.
- Add a predefined Serena MCP configuration template with setup link and `uv`
  prerequisite guidance.
- Add diagnostics for missing or failing MCP servers.
- Borrow only lifecycle/config reliability fixes from external AIRI forks if
  upstream behavior is insufficient.

### Milestone 3 - Native Swarm Runtime

- Add Spec-linked native worker jobs.
- Store live execution state in `swarm.json`.
- Support Pair mode approvals and experimental AFK autopilot policy.
- Add curated inline swarm status cards in the existing chat timeline.
- Keep workers on AIRI-mediated tools with no raw terminal access.

### Milestone 4 - ACP Engine Adapter

- Add ACP subprocess manager.
- Support Pi as an ACP backend.
- Support Codex as an ACP backend if available.
- Add engine selector in coding settings.
- Normalize ACP events into AIRI chat slices and approval requests.

### Milestone 5 - Advanced Code Operations

- Allow selected Serena mutating operations to produce proposed edits.
- Add worktree isolation for risky implementation sessions.
- Add branch/checkpoint integration.
- Add richer task history and replay.

## Open Questions

1. What production safety policy should replace the experimental AFK autopilot
   authority model?
2. What stability milestone should trigger ACP backend work?

## Decision

Proceed with an AIRI-native coding workspace hosted in the existing chat window.
Use MCP, especially Serena, as the preferred code-intelligence backend. Keep all
workspace authority and approvals in AIRI. Use native AIRI agents for the first
swarm runtime and defer Pi/Codex ACP subprocess engines until the native agent
model is stable. Coding state is scoped to chat sessions when enabled, and
Serena is offered through MCP settings as a predefined external integration
rather than auto-installed.
