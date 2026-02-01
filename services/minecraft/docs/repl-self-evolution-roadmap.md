# REPL Self-Evolution Roadmap (Discussion Draft)

## Goal

Turn the current JS planner REPL into a "poor man's coding agent" environment that can:

1. Inspect its own runtime and project code.
2. Read docs (especially Mineflayer docs) from within the REPL.
3. Propose and eventually apply tool/runtime improvements safely.
4. Register event hooks and optional background daemons for long-lived behaviors.

No implementation details in this draft are final; this is a planning artifact for review.

---

## Design Principles

- **Safety-first by default**: proposal mode before apply mode.
- **Auditability**: every introspection and mutation action is logged and replayable.
- **Layered capabilities**: observation -> proposal -> gated execution.
- **Deterministic core loop**: keep turn-based planner behavior stable.
- **Minimal trusted surface**: expose small, explicit APIs rather than raw Node/system access.

---

## Capability Areas

## 1) Self-Introspection Interface (REPL APIs)

Expose a read-oriented introspection namespace in REPL globals.

Proposed APIs:

- `introspect.runtime()` -> model, tool list, limits, feature flags, queue status.
- `introspect.tools()` -> current action/tool signatures and schemas.
- `introspect.memory()` -> mem summary + size stats.
- `introspect.last()` -> previous script/action results.
- `introspect.health()` -> basic diagnostics (event lag, retries, failures).

Notes:

- Start read-only.
- Keep outputs compact and structured.

## 2) Project Code Reading Interface

Expose controlled repository browsing from REPL without full shell.

Proposed APIs:

- `repo.list(path = ".", opts?)` -> file/dir listing (allowlisted roots).
- `repo.read(path, opts?)` -> file snippet with line ranges and size cap.
- `repo.search(query, opts?)` -> ripgrep-backed search with result caps.
- `repo.symbol(path, name)` -> optional simple symbol lookup (later phase).

Guardrails:

- Read-only initially.
- Max file size / line range limits.
- Block secrets and ignored paths (`.env`, keys, tokens, node_modules, build outputs).

## 3) Mineflayer Knowledge Surface

Provide docs/refs to help the agent compose better behavior/tool proposals.

Options:

- Local curated docs bundle (recommended for deterministic behavior).
- Indexed snippets for common APIs (movement, inventory, entities, events).
- Optional "doc cards" in prompt context for high-frequency use.

REPL API:

- `docs.find("pathfinder")`
- `docs.read("mineflayer.bot.chat")`
- `docs.example("collectBlock")`

## 4) Self-Evolution Workflow (Proposal First)

Add a governance pipeline before any self-modification:

1. Agent inspects code/docs/runtime.
2. Agent emits a **Change Proposal** object:
   - rationale
   - files impacted
   - risks
   - test plan
   - rollback plan
3. Human reviews proposal.
4. Optional apply step (future): patch generation + tests + review gate.

Proposed REPL APIs:

- `evolve.propose(spec)`
- `evolve.listProposals()`
- `evolve.getProposal(id)`
- `evolve.reject(id, reason)` / `evolve.approve(id)` (human-mediated)

## 5) Event Hooks

Support persistent declarative hooks that trigger scripts on conditions.

Hook model:

- Trigger: chat/perception/feedback/time tick/custom.
- Condition: JS predicate over `ctx`/`last`/`mem`.
- Action: script body or tool calls.
- Policy: debounce, cooldown, max executions, priority.

API sketch:

- `hooks.register({ name, on, when, script, policy })`
- `hooks.list()`
- `hooks.disable(name)` / `hooks.enable(name)` / `hooks.remove(name)`

Guardrails:

- Prevent recursive storms (hook triggers caused by own outputs).
- Global execution budget per minute.
- Trace each hook invocation.

## 6) Background Daemons

Allow optional long-running tasks for monitoring/planning loops.

Potential uses:

- Patrol/scan loops.
- Inventory housekeeping.
- Threat watcher with alerts.
- Social etiquette responder.

API sketch:

- `daemon.start({ name, script, intervalMs, policy })`
- `daemon.stop(name)`
- `daemon.status(name)` / `daemon.list()`

Constraints:

- Strict per-daemon CPU/time budgets.
- Kill switch and watchdog timeout.
- No direct world mutation unless via validated tool intents.

---

## Architecture Sketch

## REPL Context Modules

- `ctx` (readonly, per-turn injected)
- `last` (readonly, last outcome)
- `mem` (persistent writable)
- `introspect` (readonly API)
- `repo` (read-only at first)
- `docs` (read-only retrieval)
- `hooks` (managed registration)
- `daemon` (managed lifecycle)
- `evolve` (proposal orchestration)

## Runtime Services (outside REPL sandbox)

- Introspection service
- Repo/document index service
- Hook scheduler
- Daemon supervisor
- Proposal registry + audit log

---

## Rollout Plan

## Phase 0 - Foundation Hardening

- Finalize `ctx/last/mem` conventions and docs.
- Add telemetry on script size, execution time, action count.
- Add rate limits and anti-loop protections.

## Phase 1 - Read-Only Introspection + Repo/Docs Read

- Implement `introspect.*`, `repo.list/read/search`, `docs.find/read`.
- Add allowlist + secret/path guards.
- Add prompt conventions for using these APIs responsibly.

## Phase 2 - Proposal-Only Self-Evolution

- Implement `evolve.propose` and proposal registry.
- Define proposal schema + scoring rubric.
- Add review UI/log stream hooks.

## Phase 3 - Hooks + Daemons (Constrained)

- Implement managed hooks with cooldown/budgets.
- Implement supervised daemon runner.
- Add kill switch + watchdog + per-feature flags.

## Phase 4 - Assisted Apply (Optional)

- Agent can prepare patch candidates + test commands.
- Human approval required before applying.
- Automatic rollback metadata and validation report.

---

## Prompt/Policy Conventions to Add

- Prefer world tools for immediate actions.
- Use `repo/docs/introspect` for understanding before proposing changes.
- Never assume write privileges; use `evolve.propose`.
- Keep hook/daemon logic idempotent and bounded.
- Explain intent in `mem` notes before major behavior changes.

---

## Risk Register

- **Runaway autonomy**: hooks/daemons creating infinite loops.
- **Context bloat**: huge introspection outputs inflating token use.
- **Unsafe self-editing**: bad proposals that degrade behavior.
- **Secret leakage**: repo read accidentally exposing credentials.
- **Operational complexity**: too many async subsystems reducing predictability.

Mitigations:

- Hard limits + quotas + cooldowns.
- Strong allowlists and redaction layers.
- Proposal-only first, human gates later.
- Feature flags for every new subsystem.
- Rich tracing and one-command emergency disable.

---

## Open Questions (For Discussion)

1. Should proposal approval live in chat only, or also in a local UI/CLI queue?
2. How much repo scope should be readable by default?
3. Should hooks/daemons be persisted across restarts?
4. Do we want separate "safe mode" and "experimental mode" presets?
5. What exact success metrics define "self-evolution is helping"?

---

## Suggested First Milestone

Implement only:

- `introspect.runtime/tools/health`
- `repo.list/read/search` (read-only, strict limits)
- `docs.find/read` (curated Mineflayer docs)
- `evolve.propose` registry (no apply)

This gives strong value quickly while keeping risk low.
