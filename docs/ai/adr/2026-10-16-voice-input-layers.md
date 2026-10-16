# Split voice input into capture, signals, policy, runtime, and projection

Status: accepted. Migration steps 1 to 3 are implemented.

## Context

One voice input mixes four concerns in a few classes:

- `SpeechInputAttempt` owns capture, provider streams, submission, UI state, VAD evidence (`noteActivity`,
  `speechRevision`, `activityEnd`), and end detection (`detectEnd`, `endProposal`). It has 17 private fields.
- `voice-activity-plugin` owns the VAD threshold, hysteresis, silence limit, and minimum speech length.
- `voice-end-judge-plugin` owns pause timing and judgement freshness.
- UI state comes from `attempt.subscribe`, a `vue-snapshot` plugin, and `publishSnapshot` in the voice store.

Decisions are spread across these files, so a reader cannot see one input's rules in one place. The decisions also
run inside callbacks with abort signals, so they cannot run in another process or on a server. A test of a decision
needs real streams and timers.

The audio timeline is already serializable. Every block, window, and evidence range uses `sourceId` and `frame`.

## Decision

Voice input has five roles. Only events and commands cross role boundaries. Both are plain serializable data.

| Role | Owns | Contract |
| --- | --- | --- |
| Capture | Microphone, frame coordinates, history, pre-roll, playback | Commands in, PCM out. It makes no decision. |
| Signal | One prediction, for example VAD, KWS, speaker, ASR, end judgement | Audio window or document in, evidence event out. |
| Policy | When an input begins, ends, or is cancelled | Rules: `(state, event) => { state, events, commands }` |
| Runtime | Execution of commands and their side effects | Commands in, events out. |
| Projection | View state for UI, traces, and remote observers | Events in, read-only view out. |

### Events

All voice events are `@moeru/eventa` events with ids under `proj-airi:voice:`. The contracts are in
`packages/core-agent/src/voice/policy/events.ts`. Events have two kinds.

- Lifecycle events describe one input. Only the controller emits them: `inputBegunEvent`, `inputCapturingEvent`,
  `inputTranscriptEvent`, `inputFinalizingEvent`, and `inputSettledEvent`.
- Signals carry evidence. Any plugin can define one with `defineEventa`. A body that belongs to an input has an
  `inputId`. A slow signal also has `readAt`.

```ts
export const pausedSignal = defineEventa<{ inputId: string, sessionId: string, text: string, readAt: InputRevisions }>('proj-airi:voice:signal:paused')

// `metadata.revision` makes a signal count input revisions. The engine counts when this part of the body changes.
export const inputActivitySignal = defineEventa<{ inputId: string, range: AudioRange, speech: boolean, durationMs: number }, RevisionMetadata<{ speech: boolean }>>(
  'proj-airi:voice:signal:input-activity',
  { metadata: { revision: body => body.speech } },
)
```

A transport does not promise event order. The engine therefore imposes it with one queue, the `createQueue` of
`@proj-airi/stream-kit`. An event that a rule emits, or that a command causes, joins the end of the queue.

### Revisions

```ts
/**
 * For each evidence kind, the count of content changes in one input. For example:
 * { transcriptText: 7, 'proj-airi:voice:signal:input-activity': 3, context: 12 }. A count grows only when the content changes.
 * `transcriptText` is not the provider revision. A provider revision with the same text does not change it.
 */
type InputRevisions = Readonly<Record<string, number>>
```

- A slow signal result carries the entries that it read in `readAt`. A rule ignores the result when any of these
  entries changed. This replaces `detectEnd` and `endProposal`.
- A plugin that adds an evidence kind adds a key. No core type changes.

### Commands

Commands act on the device. Only the core defines them.

```ts
type VoiceCommand
  // The controller assigns the input id of a begun input. `input.cause` reaches `SpeechInputAttempt.cause`.
  = | { type: 'begin', input: BeginSpeechInput }
    // `at` is the frame where the rule decided. The runtime seals at arrival time until capture can seal at a frame.
    | { type: 'seal', inputId: string, at?: Position }
    | { type: 'cancel', inputId: string, reason: string }
    | { type: 'interrupt', turns: readonly TurnRef[], cause: string }
```

### Policy

- The policy is a set of rules. Each rule owns its state, reads events, and returns new events and commands. A plugin
  can add a rule. The first-party rules replace the decisions in the activity plugin, the end-judge plugin, and the attempt.
- Rules have no timers. Durations, for example the silence limit, are measured in frames of `speech-activity` events,
  because these events arrive for every window while capture runs.
- A rule asks for slow work with a derived event, not with a command. For example, the pause rule emits `paused`.
  The end-judge signal reads `paused`, calls the model, and emits `end-judged` with `readAt`. The end rule then emits
  `seal` when the result is `complete` and current. The core does not know about any model call.
- The runtime resolves conflicts between commands. For one input, the first `seal` or `cancel` wins. Later commands
  for that input are ignored.

### Runtime

- The runtime executes commands: admission, playback fade, capture, provider streams, finalization stages, and
  submission. It reports progress as core events. The attempt becomes this runtime for one input.
- `seal` names a frame. A command that arrives late, for example from a remote policy, seals at the frame where the
  policy decided, not at the arrival time. Capture keeps history with `retain`, so it can seal in the past.
- The plugin phases of the 2026-10-16 plugin ADR stay in the runtime. `watch` and `finalize` work on the transcript
  document. `observeAudio` plugins become signals.

### Placement

| Where | Roles | Reason |
| --- | --- | --- |
| Device only | Capture, playback, echo cancellation | The hardware is on the device. |
| Device preferred | VAD, KWS, interruption fade | Interruption needs a response in tens of milliseconds. Wake audio stays private. |
| Either | Policy | It is a pure function of events. |
| Remote preferred | ASR, end judgement, rewrite, memory search | These are network calls already. |

The device executes an interruption at once and reports it as an event. A remote policy cannot delay an interruption.

### Projection

UI state is a projection of the event stream. A trace recorder and a remote observer read the same stream.
The `vue-snapshot` plugin and the attempt listener set are removed.

## Consequences

- The rules of an input are in one place. A test feeds events and checks events and commands, without audio, timers, or models.
- A saved event log replays deterministically. IO traces can become regression tests and evals.
- The policy can move to a worker or a server without a rewrite. Only the event transport changes.
- A reader follows one more indirection: event, rule, command, runtime.
- Every slow signal result needs `readAt`. The current code needs this too, but hides it in `endProposal`.
- Rules from different plugins can propose conflicting commands. The first-wins resolution keeps this safe, but rule order matters.
- `capture.finish()` needs a frame argument.

## Migration

1. Done: lifecycle events, signals, `InputRevisions`, and `VoiceCommand` in `core-agent`.
2. Done: the VAD threshold, silence limit, minimum speech, and pause timing are first-party rules. Push-to-talk stays
   a host control, because its only decision is the minimum hold time of a user interface.
   `rules.test.ts` replays the timing of IO trace `06e9aacc`.
3. Done: end judgement is a signal that reads `paused`. `detectEnd`, `endProposal`, and `noteActivity` are removed
   from the attempt.
4. Make the attempt a runtime that executes commands and emits events.
5. Build UI state as a projection of events. Remove `vue-snapshot`.
6. Add `finish({ at })` to capture.

Each step keeps the tests green and can ship alone.

## Open questions

- Does one rule set own all inputs of a device, or one rule set for each session?
- Which transport carries events to a remote policy, and how does the device detect a lost connection?
- Does the device keep a local fallback policy for a remote policy that does not answer?
