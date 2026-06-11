# AIRI Daemonization Architecture

## Why Process Separation

The AIRI platform separates its runtime (daemon) from its user interface (desktop/frontend) into two distinct processes. This separation provides:

1. **Crash resilience**: A UI crash does not take down the runtime. Modules continue executing, tasks continue running, and the daemon can broadcast the UI crash event to other connected clients.

2. **Independent lifecycle**: The daemon can be upgraded without restarting the UI, and vice versa. Clients can disconnect and reconnect without losing runtime state.

3. **Multi-client support**: Multiple frontend clients (desktop, web, CLI) can connect to the same daemon simultaneously, each receiving the same event stream.

4. **Clean ownership boundaries**: The daemon owns all stateful runtime concerns; the frontend owns only presentation.

## Ownership Boundaries

```
┌─────────────────────────────────────────────────────────┐
│  Daemon Process (apps/daemon)                           │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ EventBus │  │ModuleRegistry│  │ RuntimeClient     │  │
│  └──────────┘  └──────────────┘  └───────────────────┘  │
│         │              │                    │            │
│  ┌──────┴──────────────┴────────────────────┴────────┐  │
│  │              IPC Server Transport                  │  │
│  │         (Unix domain socket / TCP)                 │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │                               │
└─────────────────────────┼───────────────────────────────┘
                          │  IPC (length-prefixed JSON)
                          │
┌─────────────────────────┼───────────────────────────────┐
│  Desktop Process (apps/desktop)                         │
│                         │                               │
│  ┌──────────────────────┴────────────────────────────┐  │
│  │              IPC Client Transport                  │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │                               │
│  ┌──────────────────────┴────────────────────────────┐  │
│  │              UI / Presentation Layer               │  │
│  │         (Electron, Web, CLI — future)              │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Daemon owns:
- **EventBus**: All inter-module communication
- **ModuleRegistry**: Module registration, activation, deactivation
- **RuntimeClient**: External communication (AI providers, tools)
- **SessionManager**: Client connection tracking
- **IPC Server**: Accepts client connections, broadcasts events

### Desktop owns:
- **IPC Client**: Connects to daemon, sends requests, receives events
- **UI**: Renders the user interface (not yet implemented)
- **Reconnection logic**: Handles daemon restarts gracefully

## IPC Protocol Summary

The IPC protocol uses **length-prefixed JSON messages** over Unix domain sockets (Linux/macOS) or TCP localhost (Windows).

### Message format:
```
[4 bytes: message length (big-endian uint32)][N bytes: UTF-8 JSON]
```

### Message types:

| Type | Direction | Purpose |
|------|-----------|---------|
| `event` | Daemon → Client | Broadcasts AiriEvent to all clients |
| `request` | Client → Daemon | RPC-style method call |
| `response` | Daemon → Client | Successful reply to a request |
| `error` | Daemon → Client | Error reply to a request |
| `ping` | Bidirectional | Heartbeat keepalive |
| `pong` | Bidirectional | Heartbeat response |

### Request/Response correlation:
- Each request carries a unique `id`
- The response carries the same value as `correlationId`
- This allows concurrent requests to be matched to their responses

### Example request flow:
```
Client                              Daemon
  │                                   │
  │── request(id=abc, method=...) ──▶│
  │                                   │── process request
  │◀── response(correlationId=abc) ──│
  │                                   │
```

## Transport Lifecycle

### Server (Daemon):
1. `start()` — Bind socket, clean stale files, listen for connections
2. Accept client connections, assign client IDs
3. Receive messages, dispatch to handlers
4. Broadcast events to all connected clients
5. `stop()` — Disconnect all clients, close socket, clean up

### Client (Desktop):
1. `connect()` — Open socket connection to daemon
2. Send requests, receive responses via correlation IDs
3. Receive event broadcasts
4. On disconnect: auto-reconnect with exponential backoff
5. `disconnect()` — Close socket, stop heartbeat

## Reconnection Behavior

The client transport implements automatic reconnection:

1. When the connection is lost unexpectedly, the client enters `reconnecting` state
2. Reconnection attempts use exponential backoff: 1s, 2s, 4s, 8s, ... up to 30s max
3. On successful reconnect, the client re-enters `connected` state
4. The application layer (desktop) can subscribe to state changes to update the UI
5. Requests that were in-flight during disconnect will time out and reject

## Session Management

The daemon tracks connected clients via `SessionManager`:

- Each client connection creates a `Session` with a unique `sessionId`
- Sessions transition: `attaching` → `attached` → `detached`
- Detached sessions are retained briefly for introspection, then cleaned up
- Sessions are in-memory only — no persistence

## Crash Resilience Goals

| Scenario | Behavior |
|----------|----------|
| UI crash | Daemon continues running. Other clients unaffected. |
| Daemon crash | Clients detect disconnect, enter reconnecting state. |
| Module crash | Other modules continue. Crash event broadcast to clients. |
| Network hiccup | Auto-reconnect with backoff. No data loss (events are fire-and-forget). |

## Future: Remote Runtime

The IPC protocol is transport-agnostic. While the current implementation uses Unix domain sockets for local-only communication, the same protocol could be carried over:

- **TCP sockets** for remote daemon connections
- **TLS** for encrypted transport
- **WebSocket** for browser-based clients
- **stdio** for CLI tool integration

The message envelopes (`IpcMessage` union) and transport interfaces (`IpcServerTransport`, `IpcClientTransport`) are designed to be implemented by any transport without changing the application layer.

## File Reference

| File | Purpose |
|------|---------|
| `core/ipc/protocol.ts` | Message envelope types, serialization |
| `core/ipc/transport.ts` | Transport interfaces, request/response helper |
| `core/ipc/local-socket/server.ts` | Unix socket server implementation |
| `core/ipc/local-socket/client.ts` | Unix socket client with reconnect |
| `core/ipc/index.ts` | Barrel export |
| `core/runtime/session.ts` | Session model and manager |
| `apps/daemon/src/index.ts` | Daemon entry point |
| `apps/daemon/src/lifecycle.ts` | PID file, shutdown, crash logging |
| `apps/desktop/src/index.ts` | Desktop entry point stub |
| `apps/desktop/src/client.ts` | Desktop IPC client |
