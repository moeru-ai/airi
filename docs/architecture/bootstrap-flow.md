# AIRI Core — Bootstrap Flow

## Overview

The AIRI Core is the central orchestration layer that manages module lifecycle, inter-module communication, and runtime connectivity. This document describes the startup sequence, ownership boundaries, and the rationale behind the runtime/event systems.

## Startup Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                    bootstrap()                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Phase 1: Create EventBus                               │
│     └─ In-memory pub/sub for inter-module messaging     │
│                                                         │
│  Phase 2: Create RuntimeClient                          │
│     └─ Local in-process client (no networking)          │
│                                                         │
│  Phase 3: Create ModuleRegistry                         │
│     └─ Manages module registration & lifecycle          │
│                                                         │
│  Phase 4: (Reserved for future built-in modules)       │
│                                                         │
│  Phase 5: Connect runtime                              │
│     └─ State: disconnected → connecting → connected     │
│                                                         │
│  Phase 6: Activate modules                              │
│     └─ For each module (in registration order):         │
│         ├─ Create per-module CoreContext                │
│         ├─ Call module.activate(ctx)                    │
│         ├─ On success → emit ModuleActivated            │
│         └─ On failure → emit ModuleCrashed              │
│                                                         │
│  Return CoreInstance handle                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Shutdown Sequence

Shutdown runs in reverse order:

1. **Deactivate modules** in reverse registration order (best-effort; failures don't block other modules).
2. **Disconnect runtime** (state: connected → disconnected).
3. Core is now fully shut down.

## Ownership Boundaries

```
┌──────────────────────────────────────────────────┐
│                  CoreInstance                     │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ EventBus  │  │ Runtime  │  │   Registry    │  │
│  │           │  │ Client   │  │               │  │
│  │ on()      │  │ connect()│  │ register()    │  │
│  │ once()    │  │ send()   │  │ activateAll() │  │
│  │ emit()    │  │ sub()    │  │ deactivateAll│  │
│  │ publish() │  │ state    │  │ isActive()    │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│                                                   │
│  Owned by: bootstrap()                            │
│  Consumed by: AiriModule.activate(ctx)            │
└──────────────────────────────────────────────────┘
```

- **EventBus** is the sole inter-module communication channel. Modules never call each other directly.
- **RuntimeClient** is the sole external communication channel. Modules use it to send/receive messages beyond the local process.
- **ModuleRegistry** owns module lifecycle. Modules are registered, activated, and deactivated through it.
- **CoreContext** is the injection boundary. Each module receives a context with its own `moduleId` and tagged `logger`.

## Why Runtime and Event Systems Exist

### EventBus — Inter-Module Communication

Modules need to communicate without tight coupling. The EventBus provides:

- **Decoupling**: Publishers don't know who subscribes. Subscribers don't know who publishes.
- **Type safety**: Events are defined as a discriminated union (`AiriEvent`) in `core/events/types.ts`.
- **Isolation**: A failing listener never breaks delivery to other listeners.

### RuntimeClient — External Communication

The runtime client abstracts the transport layer. Today it's in-process (backed by EventBus). Tomorrow it could be:

- WebSocket to a remote AIRI daemon.
- stdio to a child process.
- IPC to a desktop shell.

Modules don't care — they just call `send()` and `subscribe()`.

## Future Daemonization Path

When AIRI Core moves to a standalone daemon process:

1. **Replace `LocalRuntimeClient`** with a WebSocket or stdio transport.
2. **EventBus stays in-process** — it's the daemon's internal message bus.
3. **Frontend connects as a remote client** — sends commands, receives events.
4. **Module lifecycle stays identical** — the registry and bootstrap don't change.

```
Future state:

  ┌─────────────┐     WebSocket      ┌──────────────────┐
  │   Frontend  │ ◄────────────────► │   AIRI Daemon    │
  │  (Electron) │                    │                  │
  └─────────────┘                    │  ┌────────────┐  │
                                     │  │ EventBus   │  │
                                     │  │ Registry   │  │
                                     │  │ Modules    │  │
                                     │  └────────────┘  │
                                     └──────────────────┘
```

## Detached Frontend / Runtime Direction

The long-term direction is to separate the frontend (Electron/web UI) from the runtime (AIRI daemon):

- **Frontend**: Renders UI, captures user input, sends commands to the daemon.
- **Daemon**: Runs modules, manages state, executes tasks, emits events back.

The Core module system is designed to support this from day one — the `RuntimeClient` interface is the seam where the transport can be swapped without touching any module code.
