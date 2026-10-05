# Schedule playback on the driver clock

Status: proposed. #2769 implements the clock in decision 1. Decisions 2 and 3 have no implementation.

## Context

A `PlaybackGroup` is a FIFO queue. It starts a clip after the previous clip ends. It cannot start a clip at a time, and it cannot play two clips together.

Voice output needs more control than a queue. These examples show the requirements. They are not product commitments.

- Start a clip 2 seconds after another clip ends.
- Play a song and its accompaniment at the same time, on two lanes.
- Wait for a slow producer, for example RVC or a singing model, while the timeline holds its place.
- Switch back to streamed TTS after the song ends.
- Lower the music while speech plays.

Two facts limit the design:

- A producer does not know its latency. A caller cannot write absolute start times before the audio exists.
- A streamed clip has no known length until its stream ends. A later start time is known only when the earlier clip has a known end.

`createTimeline` in `@proj-airi/pipelines-audio` orders control work on named tracks. It uses `Date.now()` and `setTimeout`. JavaScript timers drift, and a blocked UI thread delays them. They cannot place a sample on the audio clock.

## Decision

### 1. The driver owns the playback clock

This part is implemented in #2769.

- `PlaybackDriver.nowMs()` and `Playback.nowMs()` read the audio clock in milliseconds.
- `PlaybackClip.startAtMs` sets the earliest start on that clock. A group still starts clips in order.
- `PlayingAudio` and each `PlaybackReceipt` entry report `PlayedAudio`: `throughMs` and the rendered `interval: { startMs, endMs }`.
- `BrowserPlayback` uses `AudioContext.currentTime`. Another platform driver supplies its own clock.

Input positions stay in source frames. Output positions use the driver clock. This decision does not map one clock to the other. Echo alignment between them needs a separate decision.

### 2. A score composes clips with relative anchors

A score is the proposed layer above the driver. It replaces fixed times with anchors, because producers cannot know absolute times.

| Concept | Meaning |
| --- | --- |
| Lane | One sequence of entries with its own gain node, for example `voice` or `music` |
| Entry | One clip on one lane, with an anchor, an offset, and a late policy |
| Anchor `after: entry` | Start when that entry's rendered audio ends |
| Anchor `with: entry` | Start at the same time as that entry |
| Anchor `at: ms` | Start at a time on the driver clock |
| `offsetMs` | Add this duration to the anchor time. The default is 0 |
| `prebufferMs` | Buffer this much audio before a start can occur. The default is the first block |
| `whenLate` | What occurs when the start time arrives before the entry has buffered enough audio |
| Ducking | One lane lowers the gain of another lane while it renders audio |

The score resolves each start time when its anchor time is known on the driver clock. Then it schedules the entry on the driver with `startAtMs`.

`whenLate` has three policies:

- `wait`: the start moves to the time when the audio is ready. Entries anchored to this entry move with it.
- `skip`: the entry settles as `skipped`. Entries anchored to it use its planned start time.
- `filler`: a filler clip plays until the audio is ready or `deadlineMs` expires. After the deadline, the entry waits or skips, as configured.

Entries in one `with` group share a barrier. The group starts only when each member has buffered `prebufferMs`, or each late member has applied its policy. Without a barrier, the accompaniment starts before the late vocal.

Example sketch. It is not an exported API.

```ts
const score = playback.openScore('session-1:turn-7')
const ack = score.add('voice', tts('OK, I will sing it for you.'))
const song = score.add('voice', rvcSong, {
  after: ack,
  offsetMs: 2000,
  whenLate: { filler: tts('One moment, please.'), deadlineMs: 8000, then: 'wait' },
})
score.add('music', accompaniment, { with: song, duckBy: 'voice' })
score.add('voice', ttsStream(answer), { after: song })

// Stop every lane, or one lane, with one fade.
const receipt = await score.stop({ fadeMs: 100 })
// Each entry reports its status, throughMs, and interval on the driver clock.
```

### 3. Each layer keeps one responsibility

| Layer | Responsibility | Location |
| --- | --- | --- |
| Driver | Audio clock, `startAtMs`, lane gain nodes, rendered intervals, fades | `@proj-airi/audio`. The interface is in `@proj-airi/pipelines-audio` |
| Score | Lanes, anchors, offsets, late policies, barriers, ducking rules, stop and receipts | `@proj-airi/pipelines-audio`. It has no session or turn concept |
| Content | Which clips to produce, when to sing, when to return to TTS | `VoiceResponse`, the agent, and voice plugins in `@proj-airi/core-agent` |

A `PlaybackGroup` becomes a score with one lane, where each entry is `after` the previous entry. Its public operations do not change.

The `VoiceResponse` slot order in #2743 becomes `after` anchors. A `SpeechStream` then does not wait in JavaScript for the previous stream to end.

`createTimeline` stays for control work, for example TTS request order and UI animation. It does not schedule audio.

## Alternatives

| Alternative | Reason for rejection |
| --- | --- |
| Absolute start times only | Producers do not know their latency, and stream lengths are unknown until the end |
| Wall-clock timers through `createTimeline` | Timers drift and stop on a blocked UI thread. They cannot align samples |
| A general audio graph or DAW engine | No caller needs arbitrary routing. The cost is high and the boundary is unclear |
| Mixing inside one `PlaybackGroup` | A group is a queue. Lanes need separate gain, ducking, and stop scope |

## Consequences

- Callers can align later output with `PlaybackReceipt` intervals now. For example, they can start a clip 2 seconds after the last rendered sample.
- A group starts its next clip after the previous `done` promise resolves. This adds a short gap of JavaScript latency between clips. A score removes the gap, because it schedules the next entry at the known end time.
- The interruption receipt reports what was rendered and when. The agent receives a time interval, not only a duration.

The score needs these driver additions. Each addition needs a browser test before the score uses it:

- A scheduled-end signal for each clip, before its audio finishes rendering.
- A buffered-duration signal for each clip, for `prebufferMs` and late policies.
- One gain node for each lane, with gain automation on the audio clock for ducking.
- A stop scope for one lane and for the full score.

Open questions:

- Does a skipped entry release its producer stream at once, or does the producer finish for a cache?
- Does a lane accept entries from more than one producer at the same time?
- How does the score report a late entry to tracing, so that slow producers are visible?
