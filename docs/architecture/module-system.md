# AIRI Module System

## Overview

The AIRI platform is built on a modular architecture where every capability —
coding, terminal access, git operations, model orchestration — is packaged as
a self-contained **module**. Modules communicate through a shared event bus and
are managed by a central registry.

This design keeps the core lean, makes individual capabilities independently
deployable, and creates clean seams for future extensions (plugins, detached
runtimes, third-party integrations).

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     AIRI Core                        │
│                                                     │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────┐  │
│  │   Registry    │  │ EventBus │  │   Runtime    │  │
│  │              │  │          │  │   Client     │  │
│  │  register()  │  │  emit()  │  │  connect()   │  │
│  │  activate()  │  │  on()    │  │  send()      │  │
│  │  deactivate()│  │  once()  │  │  subscribe() │  │
│  └──────┬───────┘  └────┬─────┘  └──────┬───────┘  │
│         │               │               │           │
│         └───────────────┼───────────────┘           │
│                         │                           │
│                    CoreContext                        │
│              (injected into modules)                 │
└─────────────────────────┼───────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
   ┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐
   │  Code       │ │  Terminal   │ │  Git        │
   │  Module     │ │  Module     │ │  Module     │
   │             │ │             │ │             │
   │  activate() │ │  activate() │ │  activate() │
   │  deactivate │ │  deactivate │ │  deactivate │
   └─────────────┘ └─────────────┘ └─────────────┘
```

## AIRI Core Responsibilities

The **core** (`core/`) provides the infrastructure that modules run on top of:

- **Module Registry** (`core/modules/registry.ts`) — Manages registration,
  activation, and deactivation of modules. Supports lazy loading so that heavy
  modules are only imported when needed.

- **Event Bus** (`core/events/`) — Typed, pub/sub event system for inter-module
  communication. Modules emit and subscribe to events without direct imports
  of each other.

- **Runtime Client** (`core/runtime/`) — Transport-agnostic interface for
  communicating with external processes (detached servers, cloud agents).
  Concrete transports (WebSocket, gRPC, stdio) are injected at startup.

- **Core Contracts** (`core/modules/module.ts`) — The `AiriModule` interface
  and supporting types (`CoreContext`, `EventBus`, `RuntimeClient`) that
  every module depends on.

## Module / Plugin Responsibilities

Each **module** is a self-contained unit that:

1. Implements the `AiriModule` interface (id, name, activate, deactivate).
2. Receives a `CoreContext` with the event bus, runtime client, and logger.
3. Registers event handlers and starts background work during `activate()`.
4. Cleans up during `deactivate()`.

Modules must **not**:
- Import other modules directly — communicate via the event bus.
- Access global singletons — use what the context provides.
- Block the activation pipeline — throw if something is wrong, the registry
  will log and continue.

## Why Coding Is a Module

The coding agent (Roo Code) is the first and most capable module in the AIRI
platform, but it is **not** special-cased in the core. It follows the same
contract as every other module:

- It registers with the id `"code"`.
- It communicates through the shared event bus.
- It can be deactivated without affecting other modules.

This is intentional. Treating coding as a module (rather than building the
platform around it) means:
- The platform can run without a coding module (e.g. a terminal-only agent).
- Alternative coding backends can be swapped in.
- The core remains focused on orchestration, not domain logic.

## Future: Detached Runtime Direction

The runtime client interface is designed for a future where modules may run
in separate processes or remote services:

- **In-process** (current): Modules run in the same process. The event bus is
  an in-memory pub/sub. The runtime client is a no-op or loopback.

- **Detached** (future): Modules may run in separate processes connected via
  WebSocket or stdio. The runtime client wraps the transport. The event bus
  may be backed by the same transport.

The abstraction is in place today so that the transition is incremental — no
module code changes when the transport changes.

## Event-Driven Architecture Goals

Events are the backbone of inter-module communication. The design goals are:

1. **Loose coupling** — Modules emit events without knowing who (if anyone)
   is listening. Consumers subscribe without importing the producer.

2. **Type safety** — All core events are defined in `core/events/types.ts` as
   a discriminated union. TypeScript narrows the payload based on the `type`
   field.

3. **Serializability** — Event payloads are plain objects with primitive
   values, making them safe to transport across process boundaries.

4. **Ordering** — Every event carries an ISO-8601 timestamp and a source
   identifier so consumers can reason about ordering and origin.

## File Layout

```
core/
  modules/
    module.ts       — AiriModule interface + CoreContext
    registry.ts     — ModuleRegistry class
  events/
    types.ts        — Core event type definitions
  runtime/
    client.ts       — RuntimeClient interface
  ipc/              — (future) IPC transport implementations
  types/            — (future) Shared platform types

```
