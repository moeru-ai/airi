# @proj-airi/alice-motion

Motion contracts, motion catalog, motion director, and motion scheduler for the Alice persona (Plan 01, section 8). The package has no renderer code: no Three.js and no Vue.

The planning documents are in `docs/alice-motion-engine/`. This package implements sprints S02 (contracts), S03 (director), S04 (scheduler), and the translation part of S08 (NeoAlice bridge) of Plan 03. The ADR is `docs/ai/adr/2026-11-04-alice-motion-contracts-v1.md`, accepted on 2026-11-05.

## What it contains

| Export | Purpose |
| --- | --- |
| `MotionIntentSchema`, `parseMotionIntent` | What the character means to express. An LLM, voice, vision, or a user can send it. |
| `MotionCueSchema`, `parseMotionCue` | What the mixer plays and when. Only the scheduler creates cues. |
| `motionChannels`, `motionStates`, `motionSources` | Allowed values. |
| `maxMessageBytes` | Size limit of one intent or cue: 4096 bytes, as the accepted ADR requires. |
| `MotionCatalog`, `defaultMotionCatalogEntries` | Semantic actions: clip or generator, channels, duration, priority, fades. |
| `MotionDirector` | Behavior states and the intents of each state, on a clock that the caller passes. |
| `MotionScheduler` | Turns intents into cues and decides which cue owns each body channel. |
| `NeoAliceTranslator`, `neoAliceBridgeTopics` | Turns NeoAlice MQTT messages into bridge events: speech, mood, and motion intents. It never publishes. |
| `resolveMood` | The shared mood table: NeoAlice, TalkingHead, and AIRI names. |
| `createSeededRandom` | Seeded random source, so a test or a recording can replay the same motion. |

## Director

`MotionDirector` turns conversation events and time into `MotionIntent`s.

| State | Intents |
| --- | --- |
| `idle` | `idle_weight_shift` every 4 to 9 s, `idle_glance` every 2.5 to 6 s, `idle_posture_shift` every 8 to 16 s |
| `listening` | `listen_head_tilt` once, `listen_nod` every 2.5 to 5.5 s |
| `thinking` | `think_glance_away` after 0.2 s and every 4 to 7 s, for 1.8 to 4.2 s |
| `speaking` | `speak_beat` every 3.4 to 6.2 s and `speak_nod` every 2 to 4 s, with the speech `sessionId` |
| `walking` | `walk` for 60 s, renewed every 55 s, and `idle_glance` |
| `acting` | One catalog action, for its catalog duration |
| `interrupted` | Nothing for 0.6 s. The speech session is cancelled. |

Events: `userStartedSpeaking`, `userFinishedSpeaking`, `speechStarted`, `speechEnded`, `interrupt`, `startWalking`, `stopWalking`, `act`, `setAffect`. Call `update(nowMs)` once per frame or tick. It returns the new intents and the sessions to cancel.

- The director never reads a clock and never calls an LLM.
- The same seed and the same events give the same intents.
- A speech session that ended or was cancelled is never replayed, so a reconnection cannot duplicate a gesture.

## Scheduler

`MotionScheduler` is the only producer of `MotionCue`s.

| Rule | Behavior |
| --- | --- |
| Validation | Every intent passes `parseMotionIntent` with the catalog actions, and every cue passes `parseMotionCue`. Both have the 4096 byte limit. |
| Idempotency | An intent ID seen in the last 10 minutes is refused. |
| Sessions | `cancelSession` stops the cues of the session and refuses its later intents. A reconnection cannot replay an old turn. |
| Speech timing | After `speechStarted(sessionId, atMs)`, `offsetFromSpeechMs` counts from the audio that plays. |
| Channels | Normal cues conflict with normal cues on a shared channel. Additive cues conflict with additive cues, and with a normal cue that cannot be interrupted. |
| Arbitration | A new cue takes its channels only with a higher priority than every conflicting cue, and only if each of them can be interrupted. On equal priority the playing cue keeps its channels. |
| TTL | A cue ends at `expiresAtMs`. `update(nowMs)` reports it and frees its channels. |

A one-arm gesture owns only its arm channel, which includes the hand of that arm. So `wave_left` and `wave_right` play together, and an arm gesture never blocks `walk`. The `hands` channel means both hands together.

`update(nowMs)` returns `start` and `stop` events in order. A renderer adapter plays them.

## NeoAlice bridge translation

`NeoAliceTranslator` reads the topics that the MagicMirror module reads, with the same field rules as its `node_helper.js`. The MQTT client lives in `packages/stage-ui` (`stores/modules/neoalice-bridge.ts`).

| Topic | Event |
| --- | --- |
| `neoalice/v1/<site>/cmd/tts/say` | `speech-text` from `tts.text` or `text` |
| `neoalice/v1/<site>/cmd/tts/audio` | `speech-audio` from `audio.b64` or `audio_base64` |
| `neoalice/v1/<site>/cmd/tts/stop` | `speech-stop` |
| `neoalice/v1/<site>/evt/stt/final` | `user-speech` |
| `neoalice/v1/<site>/evt/mood`, `neoalice/v1/<site>/cmd/evt/mood` | `mood`, through `resolveMood` |
| `neoalice/v1/<site>/cmd/avatar/gesture` | `intent` `gesture_<name>`. `wave` becomes `wave_right`. |
| `neoalice/v1/<site>/cmd/avatar/pose` | `intent` `pose_<name>` on the `posture` channel |
| `neoalice/v1/<site>/cmd/avatar/animation` | `intent` from the file name of the URL. `walking.fbx` becomes `walk`. An unknown file is ignored. |
| `neoalice/v1/<site>/cmd/avatar/emoji` | `intent` `emoji` on the `facial` channel |
| `neoalice/v1/companion/evt/companion/state`, `.../affect` | `mood` from the companion service |

- Other sites, repeated payloads within 2 s, broken JSON, and unknown commands are `ignored` events with a reason. Nothing throws.
- An avatar command above 4096 bytes is ignored, as the accepted ADR requires for motion messages. Speech audio can be up to 10 MB.

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
