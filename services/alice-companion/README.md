# @proj-airi/alice-companion

Single authority for the companion state of the Alice persona. The service reads the existing NeoAlice mood and conversation traffic over MQTT. It keeps mood, energy, five relationship metrics, and time together in one file. It publishes the result over MQTT.

The planning documents are in `docs/alice-motion-engine/`. This service implements sprint S05 (B1 and B2 of Plan 02) and decision D2 of Plan 03.

## When to use it

- Use it when more than one client shows Alice, for example the MagicMirror module and an AIRI window. All clients read one state.
- Use it when a component needs the mood in the TalkingHead or AIRI vocabulary. The state gives both names.

## When not to use it

- Do not use it as a mood source. The NeoAlice mood system stays the authority. This service copies its value.
- Do not use it for chat memory. AIRI memory (`packages/stage-ui/src/stores/memory.ts`) owns facts and sessions.
- Do not write metric values directly. Send a proposal. The service validates and clamps it.

## Run it

1. Install the workspace dependencies:

   ```sh
   pnpm install
   ```

2. Set the broker address and the data directory:

   ```sh
   export ALICE_COMPANION_MQTT_URL=mqtt://<broker>:1883
   export ALICE_COMPANION_DATA_DIR=/var/lib/alice-companion
   ```

3. Start the service:

   ```sh
   pnpm -F @proj-airi/alice-companion start
   ```

Run only one service for each data directory. A second process stops with the message `Another companion service`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ALICE_COMPANION_MQTT_URL` | `mqtt://localhost:1883` | Broker URL. `ws://` also works. |
| `ALICE_COMPANION_MQTT_USERNAME`, `ALICE_COMPANION_MQTT_PASSWORD` | none | Broker credentials. |
| `ALICE_COMPANION_DATA_DIR` | `./data` | Directory of the state, backup, audit, and lock files. |
| `ALICE_COMPANION_PERSONA_ID` | `alice` | Persona of the state file. The service refuses a file of another persona. |
| `ALICE_COMPANION_OWNER_PROFILE_ID` | `default` | Owner profile. It is kept separate from the persona. |
| `ALICE_COMPANION_PUBLISH_SITE` | `companion` | Site level of the output topics. Input on this site is ignored. |
| `ALICE_COMPANION_INPUT_SITES` | empty | Comma-separated sites to read. Empty reads all sites. |
| `ALICE_COMPANION_TIME_ZONE` | `America/Sao_Paulo` | Time zone of streaks and days together. |
| `ALICE_COMPANION_ENERGY_MODE` | `simulation` | `disabled` freezes the energy value. |
| `ALICE_COMPANION_DERIVE_INTERACTIONS` | `true` | Counts a turn from `evt/stt/final` followed by `cmd/tts/say` or `cmd/tts/audio`. |
| `ALICE_COMPANION_DERIVE_WINDOW_MS` | `120000` | Longest time between the two messages of a derived turn. |
| `ALICE_COMPANION_REFRESH_INTERVAL_MS` | `600000` | Interval to publish the state again without an event. |

## Topics

All topics use `neoalice/v1/<site>/...`. The output site is `ALICE_COMPANION_PUBLISH_SITE`.

### Input

| Topic | Payload | Effect |
| --- | --- | --- |
| `<site>/evt/mood`, `<site>/cmd/evt/mood` | `{"mood":"happy"}` or `{"state":{"mood":"happy"}}`. Optional: `intensity` (0..100), `energy` (0..100), `cause`, `causes`, `eventId`. | Copies the mood. Never estimates a missing intensity or cause. A reported energy stops the local energy simulation. |
| `<site>/evt/companion/interaction` | `{"schemaVersion":1,"eventId":"...","interrupted":false}` | Counts one completed turn. After the first explicit turn of a site, derived turns stop for that site. |
| `<site>/evt/stt/final` then `<site>/cmd/tts/say` | any | Derived turn, when derivation is on. A speech command without a speech result first does not count. |
| `<site>/cmd/companion/proposal` | `{"schemaVersion":1,"eventId":"...","sourceEventId":"<counted turn>","suggestedDeltas":{"trust":1},"reason":"..."}` | Changes metrics inside the caps. One proposal per turn. |
| `<site>/cmd/companion/settings` | `{"schemaVersion":1,"eventId":"...","mode":"companion","consent":{"relationshipTracking":true}}` | Changes mode and consent. `dating_sim` needs `romanticProgression`. |
| `<site>/cmd/companion/reset` | `{"schemaVersion":1,"eventId":"...","scope":"relationship","confirm":true}` | Resets one scope: `relationship`, `time`, `mood`, `energy`, or `all`. Mode and consent stay. |
| `<site>/cmd/companion/get` | any | Publishes the state again. |

### Output

| Topic | Retained | Payload |
| --- | --- | --- |
| `companion/evt/companion/state` | yes | Full state: mood, energy, metrics, `metricsPercent`, time together, mode, consent, `revision`. |
| `companion/evt/companion/affect` | no | `companion.affect.updated`: emotion, `talkingheadMood`, `airiEmotion`, intensity, energy, mode. Sent when mood or energy changes. |
| `companion/evt/companion/status` | yes | `{"online":true}`. The broker sends `{"online":false}` when the service stops or disconnects. |

The service never publishes on `evt/mood`. The MagicMirror module does not read the output topics, so the running mirror does not change.

## Rules that protect the state

- Chat alone never changes a metric. Only a proposal that points to a counted turn changes a metric.
- One proposal per turn. Per-proposal and per-day caps clamp the change. The defaults are in `defaultPolicy` in `src/companion-state.ts`.
- A repeated `eventId` does nothing. The service keeps the last 2000 IDs in the state file.
- Streaks count local calendar dates. A clock that moves backwards does not add a day.
- Absence never removes points. Time decay is not implemented. Its consent switch is off.
- Relationship tracking is on and romantic progression is off by default. The default mode is `companion`.

## Data files and backup

| File | Content |
| --- | --- |
| `state.json` | Current state. Replaced with an atomic rename. |
| `state.json.bak` | State before the last write. |
| `audit.jsonl` | One line per decision, with the old and new value of each changed field and the reason of each rejection. |
| `companion.lock` | PID of the running service. |

To restore the previous state:

1. Stop the service.
2. Copy `state.json.bak` over `state.json`.
3. Start the service.

If `state.json` is damaged, the service does not start. It does not replace the file with an empty state.

Protect the command topics with a Mosquitto ACL. Any client that can publish on `cmd/companion/reset` can reset the state.

## Test it

```sh
pnpm -F @proj-airi/alice-companion typecheck
```

```sh
pnpm -F @proj-airi/alice-companion exec vitest run
```
