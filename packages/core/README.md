# @proj-airi/core (MVP)

Headless runtime for AIRI with pluggable Providers, Channels and Processing pipeline.

- No Vue/Pinia dependency.
- UI shells (stage-web / tamagotchi) talk to Core via a thin bridge.
- Config validated by `zod`, storage provided by an injected backend.

> PR-1 contains *only* new files. No existing imports/paths are touched.

```
packages/core/
  src/
    primitives/
      input.ts          // Input & InputProcessor
      output.ts         // Output & OutputProcessor
      model-provider.ts // Chat / TTS / STT / VAD general interface
      message-channel.ts// IPC/WebSocket/WebRTC abstraction
      scene.ts          // Renderer/SceneControl/BodyControl abstraction
    config/
      schema.ts         // zod/yup configuration Schema
      service.ts        // get/set/subscribe storage adapter/backend
    plugin/
      index.ts          // plugin interface definition & Hook bus
      registry.ts       // runtime registry
    client/
      index.ts          // Stateless Client

```

## Purpose

The core package defines the contract layer of the system.
It provides abstract interfaces and minimal runtime utilities that other packages (such as runtime-core and front-end apps) can rely on.

## Design

 - Contract first:
  - Exposes TypeScript interfaces like ConfigBackend, CoreClient, etc. These describe what functionality exists without prescribing how it is implemented.
 - Separation of concerns:
  - core holds only abstractions and lightweight helpers. Concrete behaviour lives in runtime-core (Vue composables, lifecycle bindings) or higher-level apps.

*Any suggestions or advice for a better refactoring design is welcomed!*
