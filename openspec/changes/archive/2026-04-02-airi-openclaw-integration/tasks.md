## 1. Bridge Boundary and Transport Decisions

- [x] 1.1 Confirm the OpenClaw bridge lives in a backend/service adapter layer reached from the existing AIRI server-channel flow, rather than inside the renderer-side MCP bridge or chat store.
- [x] 1.2 Confirm the first transport is OpenAI-compatible HTTP, and document why WebSocket/Eventa remain reserved for other AIRI runtime roles.
- [x] 1.3 Define the delegated-task lifecycle contract, including task id plus queued/running/completed/failed/cancelled statuses and the minimal status-update shape exposed back to AIRI.
- [x] 1.4 Confirm the service-side adapter owns execution-history storage, and limit AIRI/stage-ui to routing plus summary consumption rather than execution-record ownership.

## 2. Bridge Contract Foundation

- [x] 2.1 Define the AIRI ↔ OpenClaw request and response schema used for delegated tasks.
- [x] 2.2 Define the execution-history record shape stored by the service-side adapter for delegated tasks.
- [x] 2.3 Add bridge-side handling for authenticated, structured calls to the OpenClaw gateway.

## 3. AIRI Routing and Response Shaping

- [x] 3.1 Add intent routing so AIRI can classify messages as chat, task, or mixed before delegation.
- [x] 3.2 Route task-like requests through the service-side bridge, consume lifecycle/status updates, and convert OpenClaw results into persona-consistent AIRI replies.
- [x] 3.3 Keep execution history separate from relationship memory while preserving both records in their owning boundaries.

## 4. Verification

- [x] 4.1 Add or update tests for routing decisions, lifecycle/status transitions, structured payloads, and success/failure/cancel handling.
- [x] 4.2 Run the relevant typecheck/build checks and perform one end-to-end smoke test against OpenClaw.
