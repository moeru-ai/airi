# Coding Workspace Spec Mode and Async Subagents - Requirements

## Summary

The AIRI coding workspace should replace the Roo-style `Architect` mode with a
Kiro-style `Spec` mode and introduce async subagents as an early architectural
primitive.

Spec mode lets the user and model plan iteratively through workspace files:

1. `requirements.md`
2. `design.md`
3. `tasks.md`

Each phase requires user approval before the next phase becomes active.
Subagents can participate in research during the requirements and design phases,
while implementation subagents must wait until approved tasks exist.

## Goals

- Add `Spec` mode as the planning mode for AIRI's coding workspace.
- Store canonical spec artifacts under `docs/specs/<feature-slug>/`.
- Keep normal AIRI chat unobstructed unless coding context is enabled.
- Support async research subagents during requirements and design work.
- Support implementation subagents after `tasks.md` is generated from an
  approved design.
- Let users mix native AIRI agents and ACP agents per subtask.
- Treat MCP, especially Serena, as the preferred code-intelligence substrate for
  research and coding context.

## Requirements

### Spec Mode

- AIRI must expose `Ask`, `Spec`, `Code`, and `Debug` coding modes.
- `Spec` mode replaces the earlier Roo-inspired `Architect` mode.
- `Spec` mode must guide planning through the ordered phase flow:
  `requirements.md` -> approval -> `design.md` -> approval -> `tasks.md`.
- `Spec` mode must write canonical artifacts as workspace files under
  `docs/specs/<feature-slug>/`.
- `Spec` mode must not edit source files.
- `Spec` mode may update only files inside its active feature spec directory.
- User approval must be required before moving from requirements to design.
- User approval must be required before moving from design to tasks.
- AIRI chat may mirror spec phase status, but the workspace files are the source
  of truth.

### Spec Artifacts

- Each feature spec directory must contain:
  - `requirements.md`
  - `design.md`
  - `tasks.md`
- `requirements.md` captures user goals, constraints, scope, and acceptance
  criteria.
- `design.md` captures the approved technical approach, data flow, interfaces,
  error handling, and test strategy.
- `tasks.md` captures implementation tasks derived from the approved design.
- The feature slug must be stable enough for native AIRI and ACP subagents to
  reference consistently.

### Async Subagents

- AIRI must model subagent work as explicit async jobs.
- Each subagent job must record:
  - phase
  - task description
  - engine
  - status
  - inputs
  - outputs
  - provenance
- Research subagents may run during `requirements.md` and `design.md` phases.
- Research subagent output may inform spec artifacts but must not mark a phase
  approved.
- Implementation subagents must not run until `tasks.md` exists from an approved
  design.
- Implementation subagents must execute only assigned tasks from `tasks.md`.

### MCP and Serena

- Subagents must be able to use AIRI's upstream MCP runtime when MCP tools are
  available.
- Serena must be treated as the preferred MCP backend for semantic code
  intelligence.
- AIRI must offer Serena as a predefined MCP settings template instead of
  silently installing it.
- The Serena template must tell users that `uv` must be available on `PATH` and
  must link to Serena's setup documentation.
- Subagent jobs must record MCP-derived inputs and outputs in their provenance
  when they use MCP tools.
- Missing or disabled MCP servers must not block normal chat or non-MCP coding
  flows.
- Serena mutating tools must not bypass AIRI-owned edit policy, diff review, or
  approval gates.

### Engine Mixing

- Subagent engine selection must be per subtask.
- The initial engine identifiers are:
  - `native`
  - `acp:pi`
  - `acp:codex`
- Native and ACP subagents must stream into the same AIRI chat timeline.
- AIRI must retain ownership of chat rendering, approvals, workspace policy, and
  persistence.
- ACP agents must be subprocess backends, not separate renderers.

### Chat Integration

- Coding controls must integrate into the vanilla AIRI chat window.
- Normal conversation must remain the default experience.
- Coding controls should stay compact and inactive unless a workspace or coding
  context is selected.
- Spec phase status and subagent job status should be visible without replacing
  the normal chat transcript.

## Acceptance Criteria

- A user can create or select a feature spec at
  `docs/specs/<feature-slug>/`.
- In `Spec` mode, AIRI can iteratively draft `requirements.md` with the user.
- AIRI cannot proceed to `design.md` until requirements are approved.
- AIRI cannot proceed to `tasks.md` until design is approved.
- Research subagents can run before final tasks exist and their output is
  attached to the active spec context.
- Implementation subagents are blocked before approved `tasks.md`.
- A task can explicitly choose `native`, `acp:pi`, or `acp:codex` as its engine.
- Serena can be configured from a predefined MCP settings template with a setup
  link and an explicit `uv` prerequisite.
- Subagent results show whether MCP or Serena contributed to the job context.
- Normal chat remains usable when no coding context is active.

## Assumptions

- `docs/specs/<feature-slug>/` is the canonical path for feature specs.
- Serena is an external dependency and is not bundled or auto-installed by AIRI.
- Research subagents can inform specs but cannot approve specs.
- Implementation subagents cannot start before `tasks.md` exists from approved
  design.
- The existing AIRI chat window remains the only visible transcript.
- ACP support is optional for the first implementation but must be accounted for
  in the data model and architecture.
