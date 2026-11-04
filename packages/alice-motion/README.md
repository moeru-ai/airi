# @proj-airi/alice-motion

Motion contracts for the Alice persona. Later sprints add the director, the scheduler, and the layered mixer to this package (Plan 01, section 8).

The planning documents are in `docs/alice-motion-engine/`. This package implements sprint S02 of Plan 03: the version 1 contracts.

## What it contains

| Export | Purpose |
| --- | --- |
| `MotionIntentSchema`, `parseMotionIntent` | What the character means to express. An LLM, voice, vision, or a user can send it. |
| `MotionCueSchema`, `parseMotionCue` | What the mixer plays and when. Only the scheduler creates cues. |
| `motionChannels`, `motionStates`, `motionSources` | Allowed values. |
| `maxMessageBytes` | Size limit of one intent or cue. |

## Test model

`fixtures/vrm/neptuna/neptuna.vrm` is the default VRM model for motion tests. Read `fixtures/vrm/neptuna/README.md` for the author credit and the license. The credit is required.

## When to use it

- Use `parseMotionIntent` on every intent that comes from outside the renderer, for example from MQTT or an LLM tool call.
- Pass `allowedActions` from the motion catalog. An unknown action is refused.

## When not to use it

- Do not send bone rotations. The contract carries intent, not poses.
- Do not use it for mood or relationship state. `services/alice-companion` owns that state and publishes `companion.affect.updated`.

## Behavior

- `parseMotionIntent` and `parseMotionCue` never throw. They return `{ ok: false, reason }` for invalid input, so one bad command cannot stop the render loop.
- A message larger than 4096 bytes is refused before parsing.
- `sessionId` is optional. The scheduler uses it to cancel the cues of an interrupted turn.

## Test it

```sh
pnpm -F @proj-airi/alice-motion typecheck
```

```sh
pnpm -F @proj-airi/alice-motion exec vitest run
```
