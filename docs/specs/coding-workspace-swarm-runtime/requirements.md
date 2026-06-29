# Coding Workspace Swarm Runtime - Requirements

## Summary

The AIRI coding workspace should support an AIRI-native swarm runtime for
executing coding specs with multiple native agents while keeping the existing
chat thread as the user-facing coordinator surface.

This spec builds on
`docs/specs/coding-workspace-spec-mode-and-subagents/requirements.md`. Spec mode
creates the feature artifacts; the swarm runtime executes approved task scopes,
tracks live coordination state, and reports progress back through AIRI.

Version 1 is native-agent first. ACP engines such as Pi or Codex are explicitly
deferred until the native runtime is stable.

## Goals

- Execute approved coding tasks with AIRI as the visible coordinator.
- Make default execution feel like pair programming, with user approval at
  meaningful steps.
- Support an experimental high-trust AFK autopilot mode where AIRI can continue
  work while the user is away.
- Keep worker chatter out of the main conversation and out of TTS by default.
- Record live swarm state in a machine-readable repo sidecar.
- Keep all worker actions routed through AIRI-owned tools and policy.
- Use same-branch optimistic collaboration for v1.

## Non-Goals

- Do not implement ACP workers in v1.
- Do not require Pi, Codex, or any external agent protocol in v1.
- Do not create, switch, merge, or manage git worktrees in v1.
- Do not create a separate swarm console or second transcript.
- Do not let workers use raw terminal sessions directly.
- Do not treat the experimental AFK authority model as production-hardening
  complete.

## Requirements

### Relationship to Spec Mode

- A swarm must attach to one active feature spec directory under
  `docs/specs/<feature-slug>/`.
- The active feature spec directory must contain `requirements.md`, `design.md`,
  and `tasks.md` before normal swarm execution begins.
- The swarm runtime must support the Spec entry flows defined for the coding
  workspace:
  - requirements-first
  - design-first
  - quick spec
- Pair mode should default to requirements-first or design-first flows.
- AFK autopilot should default to quick spec when the user has not already
  approved detailed requirements and design.
- `tasks.md` must contain stable task IDs such as `T-001`.
- Swarm jobs must reference task IDs from `tasks.md`, not inferred task text.

### Swarm State Sidecar

- Each active feature spec directory may contain `swarm.json`.
- `swarm.json` is the repo-visible live execution state for the swarm.
- AIRI runtime persistence may mirror or cache swarm state, but `swarm.json`
  must remain sufficient for the user and future agents to inspect current
  execution state.
- `swarm.json` must record at least:
  - schema version
  - feature slug
  - active mode: `pair` or `afk`
  - coordinator identity
  - worker agent summaries
  - job records linked to `tasks.md` task IDs
  - job lifecycle status
  - selected engine
  - communication summaries
  - file touch records
  - conflict records
  - patch proposal records
  - verification results
  - git commit and push results when applicable
  - final reports
- `swarm.json` must not store secrets, API keys, credentials, or raw environment
  dumps.

### Roles and Engines

- AIRI is the visible coordinator for the swarm.
- The coordinator owns user-facing decisions, approvals, TTS-eligible messages,
  and final reports.
- V1 worker engines are native AIRI agents only.
- Worker records should still include an `engine` field so future plugin or ACP
  engines can be added without redesigning job state.
- V1 spawning is root-only: the coordinator may create worker jobs, but workers
  must not spawn child workers.
- Worker records may include parent/root fields for future recursive spawning,
  but those fields must not enable recursive spawning in v1.

### Pair Mode

- Pair mode is the default interactive execution mode.
- The coordinator must ask for user approval before each meaningful step that
  changes workspace state or advances execution authority.
- Meaningful steps include:
  - starting a task batch
  - applying a patch
  - running a terminal command
  - committing changes
  - pushing changes
  - marking a task complete
- Pair mode should keep the user engaged through concise coordinator summaries
  rather than raw worker chatter.

### AFK Autopilot

- AFK autopilot is an explicit high-trust mode selected by the user.
- AFK autopilot may implement approved tasks, run verification, create commits,
  and push to the current branch without per-step user approval.
- AFK autopilot authority is intentionally broad for the experimental phase.
- AFK autopilot still routes actions through AIRI-owned tools, policy hooks, and
  logging so authority can be narrowed later.
- AFK autopilot must record its active policy in `swarm.json`.
- AFK autopilot must leave a final coordinator report with:
  - completed task IDs
  - changed files
  - verification commands and outcomes
  - commit hashes
  - push status
  - failures or skipped tasks
  - follow-up recommendations
- AFK autopilot must not store or expose secrets in `swarm.json` or chat.

### Tool Authority

- Workers must use AIRI-mediated tools for code lookup, file reads, MCP-backed
  context, patch proposals, file touch notices, and status reports.
- Workers must not receive raw terminal access in v1.
- Workers must not run direct git commands in v1.
- The coordinator may request terminal commands through AIRI wrappers.
- In Pair mode, coordinator terminal commands require user approval.
- In AFK autopilot, coordinator terminal commands may be auto-approved by the
  active AFK policy.
- MCP and Serena may be used for code intelligence when available, subject to
  the MCP requirements in the Spec Mode and Async Subagents spec.

### Patch and Edit Flow

- Worker edits should be represented as task-linked patch proposals.
- Patch proposals must identify:
  - task ID
  - worker ID
  - touched files
  - summary
  - validation performed by the worker
- Pair mode applies accepted patches only after coordinator and user approval.
- AFK autopilot may auto-accept and apply patch proposals under the active AFK
  policy.
- Applied patches must be reflected in the corresponding job record.

### Communication and TTS

- The swarm runtime must support internal communication primitives:
  - coordinator-to-worker messages
  - worker completion reports
  - direct messages
  - broadcasts
  - topic channels
- Full worker communication must be inspectable from swarm state or expanded UI.
- The main chat transcript must show only coordinator-curated inline summary
  cards by default.
- Worker chatter must be silent by default.
- AIRI TTS must be coordinator-only by default.
- TTS-eligible messages include coordinator-authored user-facing summaries,
  questions, and completion notices.

### Conflict Handling

- V1 uses same-branch optimistic collaboration.
- The runtime must record file touch notifications for active jobs.
- Overlapping active file touches must create soft conflict warnings.
- Soft conflict warnings must notify the coordinator and involved workers.
- Soft conflict warnings must not automatically lock files or pause jobs.
- The coordinator may surface a compact conflict card when user attention is
  needed.

### Lifecycle and Recovery

- Jobs must support these lifecycle states:
  - queued
  - running
  - blocked
  - completed
  - failed
  - cancelled
  - interrupted
- AIRI must update job lifecycle state in `swarm.json`.
- If AIRI reloads or crashes while jobs are running, recovered jobs must not be
  treated as actively running until AIRI confirms or resumes them.
- Interrupted jobs should keep enough context for the coordinator to retry,
  reassign, or summarize the failure.
- Completion reports must be tied to task IDs and worker IDs.

### Chat Integration

- The existing AIRI chat remains the only user-facing coordinator thread.
- Swarm status should appear as compact inline cards, not as a separate page.
- Inline cards should summarize:
  - active jobs
  - blocked jobs
  - conflicts
  - verification results
  - commits and pushes
  - final reports
- Cards may be expandable for details, but collapsed cards should avoid flooding
  the chat transcript.

## Acceptance Criteria

- A feature spec can opt into swarm execution after `tasks.md` contains stable
  task IDs.
- AIRI creates or updates `swarm.json` in the active feature spec directory.
- Pair mode blocks on user approval for patches, commands, commits, pushes, and
  task completion.
- AFK autopilot can proceed without per-step approval and records its broad
  policy in `swarm.json`.
- Native workers can produce task-linked patch proposals without raw terminal or
  direct git access.
- ACP engines are not required for v1 behavior.
- Same-branch file touch overlaps create soft warnings but do not lock files.
- Worker communication is available for inspection but does not spam the main
  transcript or TTS.
- Coordinator-authored final reports summarize task outcomes, validation, git
  activity, blockers, and follow-ups.

## Assumptions

- The first swarm implementation is experimental and high-trust.
- Production-grade AFK safety policy will be a later hardening milestone.
- Native AIRI agents are sufficient to debug the runtime model before ACP is
  introduced.
- All v1 workers operate on the current branch.
- Users who enable AFK autopilot accept that AIRI may commit and push on their
  behalf under the active policy.
