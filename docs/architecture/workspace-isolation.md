# Workspace Isolation & Execution Sandbox Infrastructure

## Why Isolation Precedes Autonomy

Before an AI agent can autonomously reason about tasks, it needs **bounded execution environments** where its actions are predictable, recoverable, and non-destructive. Workspace isolation provides this foundation:

- **Filesystem containment**: All execution happens within a workspace directory. The agent cannot escape to the host filesystem.
- **Git isolation**: All git operations target worktrees, never the primary repository. The agent can freely experiment with branches.
- **Lease-based access control**: Only one session can execute in a workspace at a time, preventing conflicting concurrent modifications.
- **Deterministic recovery**: After a crash or restart, workspace state is restored from snapshots + replayed events.

## Worktree Strategy

### Branch-per-Workspace

Each workspace can optionally have its own git worktree:

```
primary-repo/                  # Never mutated by agents
├── .airi-worktrees/
│   ├── ws-abc123/             # Workspace for workspace ws-abc123
│   │   ├── .git               # Worktree marker (file, not dir)
│   │   ├── src/
│   │   └── ...
│   └── ws-def456/             # Workspace for workspace ws-def456
│       ├── .git
│       └── ...
├── src/                       # Primary source
└── ...
```

Worktrees are created from a specified branch (e.g., `main`) with a new branch name derived from the workspace ID. This gives each workspace an isolated git history.

### Detached Worktree Support

When no branch name is specified, a detached HEAD worktree is created. This is useful for:

- Exploratory tasks that don't need a named branch.
- One-off execution environments that will be discarded after task completion.
- Scenarios where the agent should not create persistent branches.

## Execution Containment Philosophy

### Filesystem-Level Isolation

All filesystem operations are constrained to the workspace root:

1. **Path validation**: Every path is resolved relative to the workspace root and checked for traversal attacks (`../` escaping).
2. **CWD scoping**: Terminal commands execute with CWD set to the workspace root.
3. **Session directories**: Each session gets its own subdirectory under the workspace root for temporary files.

### Lease Model

The lease model prevents conflicting concurrent access:

```
creating → active → leased → executing → suspended → active
                    ↓
              destroying → destroyed
```

- A workspace can only be leased by one session at a time.
- Lease tokens are cryptographically random UUIDs.
- Leases can have optional expiry (for time-bounded execution).
- Workspace-scoped tools validate the lease before execution.

### Event-Driven State Transitions

All workspace lifecycle transitions emit events through the EventBus:

- `workspace.created` — New workspace created
- `workspace.destroyed` — Workspace destroyed
- `workspace.leased` — Lease acquired
- `workspace.released` — Lease released
- `workspace.recovered` — Workspace restored after restart
- `workspace.corrupted` — Corruption detected
- `worktree.created` — Git worktree created
- `worktree.removed` — Git worktree removed

## Deterministic Recovery Goals

After a crash or restart, workspace state is recovered deterministically:

1. **Load snapshot**: The latest `RuntimeSnapshot` is loaded, which now includes `SerializedWorkspace[]`.
2. **Restore workspaces**: Workspace manifests are loaded from `WorkspaceStorage` and restored into the `WorkspaceManager`.
3. **Reconcile orphaned**: Workspaces with no active session are flagged for cleanup.
4. **Detect corruption**: Invalid workspace metadata is detected and emitted as `workspace.corrupted` events.
5. **Replay events**: Events since the snapshot are replayed to rebuild in-memory state.

Recovery is deterministic: same snapshot + same events = same recovered state.

## Known Limitations

### Filesystem-Level Only

Current isolation is at the filesystem level only. There is no:

- **Kernel isolation**: No cgroups, namespaces, or seccomp profiles.
- **Network isolation**: Workspaces share the same network namespace.
- **Resource limits**: No CPU/memory quotas per workspace.

This is intentional for Phase 11. The goal is to establish the workspace abstraction and lifecycle before adding kernel-level isolation.

### No Container/VM Orchestration

Workspaces use the host filesystem directly. Future phases may introduce:

- **Docker containers** per workspace for kernel isolation.
- **MicroVMs** (e.g., Firecracker) for stronger isolation with fast startup.
- **Kubernetes pods** for distributed workspace scheduling.

### Single-Process Assumption

The current `WorkspaceManager` is in-process. Multi-process workspace coordination (e.g., via IPC) is not yet implemented.

## Suggested Next Phase

**Phase 12: Autonomous AI Behavior** — With workspace isolation in place, the agent can now safely:

1. **Autonomous task decomposition**: Break tasks into plans with workspace-scoped steps.
2. **Self-directed execution**: Execute plans within workspaces without human intervention.
3. **Progress reporting**: Report progress through workspace events.
4. **Error recovery**: Recover from errors using workspace snapshots and replay.

The workspace infrastructure ensures that even if the agent makes mistakes, the damage is contained within the workspace and recoverable.
