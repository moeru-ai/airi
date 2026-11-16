# AIRI Agent Execution Project Memory

Status: maintained

This document stores stable decisions for AIRI Agent execution and its AUV integration. The [maintenance handoff](../handoffs/airi-agent-execution-maintenance.md) stores the current task state.

## Product goal

AIRI must act as an agent in Agent mode, not only chat. When a user gives a task, the Agent must inspect its available tools, assess the task, and take the next useful action.

The Agent must not claim that a capability is unavailable before it inspects the live tool catalog and runtime. If a tool is available, the Agent must use it when the task and approval policy permit.

When a capability is missing, the Agent must name the observed boundary and keep working on useful parts. It must not invent a tool result or claim success without evidence.

## Ownership boundaries

- Core Agent owns the Agent loop, tool calls, and Compact behavior.
- Stage UI owns provider integration, shared tool projection, and chat surfaces.
- Electron Main owns Host identity, mutation approval, and action settlement.
- `computer-use-mcp` exposes AIRI tools and routes desktop work to AUV.
- AUV owns Windows desktop observation and input delivery through its SDK and daemon.
- Terminal owns shell execution. It is independent of AUV desktop access.
- Compact is a Core Agent feature. It is not a Computer Use MCP tool and grants no input authority.

AIRI owns planning, product policy, and approval UX. AUV owns operating system input and observation. Do not add a second desktop driver or approval state machine in AIRI.

The bundled Agent currently receives selected AUV, Terminal, and PTY tools directly. Other service tools remain available through on-demand MCP discovery. Verify this catalog before each release because it can change.

## Execution invariants

With Turbo disabled, every Computer Use mutation enters the Main-owned approval flow. With Turbo enabled, Host authorization grants session-scoped approval for the configured action set.

Computer Use approval does not depend on Terminal or Terminal Turbo. Chat and Agent use the same Host action, approval, settlement, and trace path.

An AUV input receipt proves delivery only. It does not prove the requested application state. The Agent must observe the application after an action before it reports the goal as complete.

If a dispatched action loses its response, its outcome is unknown. The Agent must observe current application state before it considers another dispatch. Compact must preserve pending and unverified work without replaying an action.

The Agent must reason about capability and risk from available tools and observed state. It must remain proactive within that scope and state a specific blocker when progress stops.

## Evidence rules

- A typecheck, unit test, MCP handshake, API response, or screenshot proves only its own boundary.
- A real-model Agent test must include tool selection, Host approval when required, tool settlement, a fresh observation, and the requested application outcome.
- A final reply must distinguish delivered input from verified application state.
- A failed, cancelled, or missing tool response must not trigger blind replay.
- Keep API keys, local paths, device names, and user identifiers out of this repository.

The AUV package version and runtime smoke evidence live in [Terminal lane status](../../../services/computer-use-mcp/terminal-lane-status.md). Read that record before you claim current runtime support.

## Memory and handoff rules

This file holds stable product decisions and evidence rules. Update it when source code or a verified runtime result changes those rules.

The maintenance handoff holds the current branch, checkpoint, completed work, open risks, exact validation results, and next actions. Replace stale checkpoint details instead of appending repeated summaries.

The MCP `task_memory` tools hold session-local task state. They do not persist project knowledge across sessions. Do not treat that state as this project memory.

When a task ends, update the handoff with exact commands and outcomes. Keep evidence artifacts outside prompts and include only safe references in repository documents.
