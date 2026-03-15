# @proj-airi/server-shared

The shared type definitions for all server-side packages of Project AIRI.

## Usage

```shell
ni @proj-airi/server-shared -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @proj-airi/server-shared -D
yarn i @proj-airi/server-shared -D
npm i @proj-airi/server-shared -D
```

```typescript
import type { WebSocketEvents } from '@proj-airi/server-shared'
```

## How to use the events in distributed use cases?

### Scenarios

#### Minecraft agent

##### 1. Urgent combat (witch attack)

- Minecraft sends `spark:notify` (kind=alarm, urgency=immediate, payload hp/location/gear, destinations=["character"]).
- Character `spark:emit` working ("Seen it").
- Character issues `spark:command` with interrupt=force and options (retreat vs push).
- Minecraft `spark:emit` working ("Pillared up; healing") then done/blocked as it executes.
- Optional `context:update` for summary/memory.

##### 2. Prep plan (Ender Dragon)

- Discord/user intent triggers character `spark:command` to Minecraft (intent=plan, interrupt=soft, steps gather beds/pots/gear, fallback).
- Optional `context:update` with tips (lane='game').
- Minecraft streams `spark:emit` progress.
- If ambushed, Minecraft raises new `spark:notify` (alarm/immediate) to preempt.
- Character revises with another `spark:command`.
- Completion via `spark:emit` done + summary note.

##### 3. Routine nudge

- Minecraft signals low food via `spark:notify` (kind=reminder, urgency=soon, destinations=["character"]).
- Character defers to next tick and sends `spark:command` (interrupt=soft, intent=plan: "gather food nearby").
- Minecraft `spark:emit` queued/working then done.

##### 4. Multi-step command while researching (plan + live control)

> [!NOTE]
> Using `intent=plan` keeps the loop alive even with un-finalized ideas—similar to TODO scaffolding in coding agents—while richer guidance is still being researched.

- Character receives a user goal (e.g., fortify base) and issues an initial `spark:command` to Minecraft (interrupt=soft, intent=plan, steps to gather materials) so the agent keeps working.
- Character simultaneously performs memory/search/design tasks outside the game loop (wiki lookup, prior notes).
- As insights arrive, character sends `context:update` (lane='game', hints/ideas) to enrich the sub-agent without preemption.
- If an urgent event occurs during prep, Minecraft raises `spark:notify` (alarm) → character responds with a short `spark:emit` working and a `spark:command` (interrupt=force) to handle it (e.g., retreat, block up).
- Once design is ready, character sends a refined `spark:command` (`intent=proposal` (or `action`), `interrupt=soft`) with structured options/steps/fallbacks.
- Minecraft streams `spark:emit` progress; when complete, character summarizes via `spark:emit` or `context:update` for memory.

## License

[MIT](../../LICENSE)
