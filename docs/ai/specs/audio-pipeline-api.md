# Audio pipeline API guide

The [version 4 plugin contract](voice-plugin-api.md) builds on this base capture and interruption API.
Its VoiceResponse replaces the base response surface with ordered SpeechStreams. It does not expose a direct playback bypass.

Status: implemented, version 3.2. #2769 added the audio primitives, #2770 the voice controller, and #2772 the application migration.
The public types are in `packages/pipelines-audio/src/index.ts` and `packages/core-agent/src/voice/index.ts`. When this guide and the code differ, the code is correct.
Version 3.2 replaces device leases and capture delivery formats with shared sources and subscriptions.
`VoiceController` is the current name. The input and response guide uses `SpeechInput` for one accepted voice input.

## Changes during implementation

- `AudioInput` accepts only a `LiveAudioSource`. `fileSource` returns an `AudioSource`, which a caller reads directly.
- `Outcome` has no `range`. A finished capture reports its interval as `value`. `capture.started` resolves `false` when no audio arrived.
- `AudioInput.retain(signal)` returns a `HistoryLease`. The holder calls `hold(position)` as its work completes.
- `subscribe`, `capture`, and `ordered` observers take `maxBufferedMs`, 60 seconds by default. Only the slow reader fails.
- `PlaybackReceipt` is a union. Only a `failed` receipt has `error`. Playback groups keep their `label`.
- `voice.openResponse(turn)` returns a `VoiceResponse`. The design name `ResponseHandle` does not exist.

## Quick start

The application owns one `AudioInput` for the selected device. It also provides `VoiceController` and `AudioPlayback` instances.
Vue components receive these instances. They do not create contexts, providers, or encoders.
The input wraps a `LiveAudioSource`, for example `microphoneSource(constraints)`. The source handles permission and tracks.
Every consumer subscribes with its own abort signal. The first subscriber opens the microphone, and the last one to leave closes it.
Voice attachments, transcription, and detectors use the same input.

```ts
const recording = capture(input)
const wav = encodeWav(recording.stream, { sampleRate: 16000, channels: 1 })

// A later release event ends recording.
const result = await recording.finish()
if (result.status === 'finished')
  await hearing.transcribe(await wav)
```

`hearing.transcribe` is the application's downstream adapter, not a method supplied by the audio package.
AudioInput never imports Hearing, chat, providers, Pinia, Vue, or character settings.

For live delivery, pass `recording.stream` downstream immediately. When the accepted input ends, call `finish()`.
Do not await the downstream transcript before ending capture. A provider can wait for end-of-stream before returning text.
Every transcription provider receives PCM. A provider adapter that needs a file encodes the stream with `encodeWav`.
An adapter that needs tracks, such as Web Speech, creates them with `toMediaStream`.
A stored recording is also a source, but not a live source. `fileSource(blob)` decodes it into the same PCM stream.
Each consumer opens its own file stream, and its reader sets the decode speed. `AudioInput` does not accept a file.

```ts
const events = transcriber.transcribe({ audio: fileSource(recording).open(signal), signal })
```

## Who owns each operation

| Object | Owner | End operation | Effect on siblings |
| --- | --- | --- | --- |
| Physical source and PCM history | Application's AudioInput | Last subscription ends, or `close()` | `close()` ends every subscription |
| One recording | Capture handle | `finish()` or `cancel(reason)` | None |
| One detector | Observer handle | `cancel()` | None |
| One response's output | PlaybackGroup handle | `finish()` or `stop({ fadeMs })` | None |
| One accepted input request | SpeechInputAttempt handle | `end()` or `cancel(reason)` | None |
| Reasoning through response delivery | VoiceController, indexed by TurnRef | `interrupt(...)` | Only named turns |

A source declares ownership when it opens or attaches a device.
`microphoneSource` stops its tracks and closes its own AudioContext. `mediaStreamSource` disconnects its graph without stopping caller-owned tracks.
Each connection has a new `sourceId`. Frame coordinates and history never cross connections.

Capture `finish()` stops accepting samples immediately. Repeated calls return the same completion promise.
Finalization drains accepted samples, closes live outputs, and finalizes the file.
It never waits for ASR, LLM, or agent delivery.
The PCM adapter owns stream backpressure and pending accepted samples. The public contract specifies no queue byte quota.
Finish waits for accepted samples to drain, then closes the stream. The caller can cancel a stalled operation.
Cancellation wins until completion settles. After settlement, both operations return or preserve the recorded outcome.
ReadableStream cancellation cancels that capture.
A sample gap fails the capture, because consumers treat its stream as continuous audio.
Input shutdown cancels unfinished captures. It does not implicitly submit recordings.

## Speech detectors and control signals

VAD, wake words, buttons, and toggle controls select capture operations outside AudioInput.
No capture option names a detector or input mode.
A detector is an ordinary asynchronous function from an audio window to a value.
Functions can compose detector results without creating AudioNodes or changing AudioInput.

```ts
const speaker = observe(
  input,
  { windowMs: 1500, hopMs: 500, scheduling: 'latest' },
  async (window, signal) => identifySpeaker(window.channels, window.sampleRate, signal),
  result => speakerPolicy.accept(result),
)
// Cancels only speaker identification.
speaker.cancel()
```

`identifySpeaker` and `speakerPolicy` belong to the application or a model adapter.
The runtime supplies copied windows and tags results with their source and interval.
The default scheduling retains one active call and one replaceable pending window.
Ordered scheduling preserves window order. Detector authors own their processing speed and workload policy.
Stateful onset VAD uses ordered scheduling. Latest scheduling is appropriate only for models that tolerate skipped windows.
A gap resets overlap. The next complete window reports `discontinuity: true`.
Cancel aborts the current call, discards queued work, and prevents late result publication.
An uncooperative detector can finish privately. It cannot update the cancelled observer.
CPU-heavy detectors run in workers. A Promise alone does not move computation off the audio or UI thread.

VAD publishes evidence. The external speech policy applies confidence, echo rejection, speaker identity, and end-of-turn rules.
VAD silence does not itself prove the conversational turn ended.
The input remains observable during assistant playback, PTT fades, and Hearing mode changes that retain wake-word listening.

## PTT, toggle, wake word, and voice messages

```ts
const attempt = voice.beginInput({
  sessionId,
  interruptTurns: audibleTurns,
  start: { kind: 'after-silence' },
})
// A later release event ends PTT.
await attempt.end()
```

The caller takes `sessionId` and `audibleTurns` from an application snapshot at the control event.
The controller freezes that target. A later character selection cannot redirect it.
It interrupts named turns with a 100 ms fade and waits for silence before accepting samples.
UI can show the pending attempt immediately.
Release during permission or fade cancels the attempt without creating a recording or submitting empty audio.
Permission dialogs cannot always be aborted. The microphone source stops any late tracks after cancellation.
Toggle uses the same attempt: the first press begins, the second ends.
Wake word selects the matched session and uses the same after-silence policy.
Speaker identification and wake-word observation stay active during the fade.

Natural voice input uses `speech-onset.at` for the actual onset and optional `preRollMs` for earlier context.
The default pre-roll is zero. The runtime clamps pre-roll at source frame zero, but never at the current history boundary.
It retains available speech history immediately while the selected output fades.
The speech policy must reject playback echo before it admits this request.
Missing history fails explicitly. It never silently claims that the complete speech input was captured.
For pre-roll, the caller selects history retention that covers pre-roll and detection latency.
The controller checks the requested range immediately.
If the start position is too old, the attempt fails with stage `admission`.
Each source connection receives a fresh sourceId. A position from an old device cannot address its replacement.

A voice message attachment uses AudioInput directly. It remains available when Hearing mode is off.
Only the application decides whether to send the resulting Blob, retain a draft, or discard it.

## Attempt state and turn detection

`attempt.state` exposes pending, capturing, finalizing, or settled state.
`subscribe` supplies the current snapshot immediately and later changes synchronously.
It is a UI subscription, not another owner of the attempt.
Subscriber exceptions are reported to the host diagnostic handler without changing the attempt.

One controller accepts one active input at a time. `activeInput` contains its pending or capturing attempt.
A new beginInput cancels that active attempt with reason `replaced` before creating its replacement.
Ending capture clears activeInput immediately. Earlier final ASR and submission continue under their own attempt identities.
Different response sessions can still generate concurrently.

Repeated end calls return done. Ending a pending attempt cancels it without accepting samples.
Cancel wins until durable draft or message acceptance commits. Cancellation after that point cannot retract the committed item.
End, detector completion, and cancellation are serialized by the controller.
Operational failures resolve SpeechInputAttemptOutcome with a stage and error. These lifecycle promises never reject.
Invalid settings cause an exception before allocation. Failure preserves recoverable draft media through the application draft store.

```ts
const turns = attempt.detectEnd(
  { windowMs: 1500, hopMs: 250, activity: 'ordered' },
  (evidence, signal) => detectTurn(evidence, signal),
)
// Cancels this detector and every pending decision it owns.
turns.cancel()
```

detectEnd waits for recording to start. It uses only audio accepted for that attempt.
If capture already ended or failed, detectEnd returns a cancelled observer without calling the detector.
The caller does not filter audio ranges or manage the copied samples.
It uses latest scheduling: one active evaluation and one replaceable pending window.
It cancels when capture ends, the attempt fails, or the attempt is cancelled.
Cancelling the returned observer invalidates every end proposal it owns, including uncooperative in-flight calls.
It leaves recording active. The caller can install another detector or end manually.
Installing a replacement detector cancels the prior detector for that attempt.
A detector exception fails the attempt with stage `detector`. It never silently commits speech.

The controller applies an end decision only when transcript, context, and speech revisions still match.
The Hearing adapter supplies updated transcript copies. Each copy has an attempt ID and a higher revision number.
The conversation adapter supplies updated session copies. Each copy has a higher context revision number.
VAD policy calls activeInput.noteActivity({ range, speech }) for every ordered result, including silence.
The controller tracks contiguous analyzed coverage and increments speechRevision for newer positive speech evidence.
The controller ignores repeated ranges, unrelated ranges, and results received after capture ends.
Overlapping ranges contribute only their newly covered accepted samples.
After-silence attempts ignore activity until recording starts. Speech-onset attempts keep matching results with their saved audio history.
Continuing silence does not invalidate a result by itself.
These three publishers supply revision state. UI components never synthesize revision counters.
Ordered mode holds an end proposal until VAD coverage reaches the detector window's end.
A coverage gap rejects the proposal. New positive evidence invalidates it through speechRevision.
Self-contained mode lets the turn detector judge activity from its own audio window without a separate VAD coverage requirement.
Neither mode predicts speech that begins after the analyzed interval. Later speech can begin the next input attempt.
The decision uses available evidence. Product tests must measure detection quality and the delay before speech ends.
Before the first ASR result, the transcript is empty at revision zero.
File-only ASR cannot supply incremental text. Its detector must use audio/context or await the final transcript after manual or acoustic ending.
Revision and activity checks determine stale results. Detection policy can apply its own age threshold.
Cancelling or replacing an attempt prevents its pending decisions from taking effect.
A valid end decision stops capture at the current position. It cannot retract audio already sent to a live provider.
Ending capture fixes the speech input's audio range. Final ASR can still update the transcript before draft or agent submission.

## Interruption

```ts
const interruption = voice.interrupt({ turns: [turn], cause: 'user-button' })
const receipts = await interruption.silenced
const delivery = await interruption.done
```

The call immediately rejects new tokens, tool results, TTS chunks, and playback requests for the target turns.
It aborts their generation, queued work, and synthesis. It fades their playback groups over 100 ms.
Unrelated sessions, UI sounds, microphone capture, and observers remain active.
Tool cancellation prevents late results from reaching the interrupted turn. It cannot undo an external side effect already committed.

`silenced` settles after the playback adapter reports silence or failure for every target group.
It contains one entry per distinct target turn, including turns without audio.
Unknown turns report failure. Known turns without audio report silent without a playback receipt.
After-silence recording starts only when every receipt reports `silent`.
It never treats an abort request, UI flag, or fixed JavaScript timeout as proof of silence.
`done` settles after registered cleanup and a durable interruption record, or reports failure.
Its notifications contain one stable event ID and delivery status for each distinct target turn.
Each status reports acknowledged, queued, or failed delivery separately from durable recording.
Acknowledged means the agent receiver saved the control event. It does not mean a model generated another response.
The notification adapter owns acknowledgment timeout and retry policy.
If the saved notification queue still holds the event, the controller then reports queued.
Each record contains its event ID, turn reference, cause, and estimated playback positions.
A saved notification queue delivers this control event to the agent. The receiver ignores duplicate event IDs.
Retries use that ID. They do not invent a new user speech input or start another response.
Overlapping interruption requests reuse each target turn's existing interruption record.
For requests covering A/B then A/C, A keeps its original event ID. C receives a new event ID.
The Interruption.id identifies a request, not an agent event. First interruption cause wins for each target turn.
Playback has no agent notification method and no knowledge of TurnRef.

The chat runtime calls voice.openResponse(turn) once for each allocated turn identity.
It uses response.playback for TTS output and response.signal for reasoning and synthesis requests.
The controller therefore owns the exact TurnRef-to-group mapping before output starts.
Repeated openResponse for an active turn returns the existing handle. Opening a closed identity throws.
The conversation store records closed turn IDs. Removing an ID from a local cache does not permit that turn to restart.
Natural completion calls response.finish(). Interruption closes the same handle and aborts its signal.
The chat runtime must use turn-keyed delivery operations, which reject closed turns even if a provider ignores abort.

`PlaybackGroup.stop()` rejects all further audio for the group before asynchronous fade work starts.
Late enqueue returns `stopped`. It never allocates another group for the same handle.
Repeated stops share completion and keep the first fade duration. A stop during natural draining overrides the drain.
Fade duration must be finite and nonnegative. Invalid values throw without changing the group.
Clip IDs must be unique within a group. A duplicate fails without disturbing the original clip.
Receipts list played clips in their enqueue order. Never-started clips do not appear in played positions.
Enqueue takes ownership of a readable stream even when it rejects late or duplicate input.
It cancels rejected or stopped streams and releases owned readers. Normal completion consumes through EOS.
Enqueue settles after playback ends, stops, or fails, not at queue acceptance.
Stopping playback of a capture stream consequently cancels that capture and its pending archive.
An independent archive requires separate input captures, not a tee of that stream.
All operational playback and interruption failures resolve their declared results. Those lifecycle promises do not reject.
Fade uses the audio clock. A suspended context must stop sources and clear scheduled output before it reports silence.
Resume must not resurrect stopped audio. Host loss produces a failed receipt, not a successful silence claim.
Playback receipts estimate rendered audio. They do not prove what the person heard or exactly which word completed.

The playback driver owns the audio clock. `AudioPlayback.nowMs()` reads it.
A clip can set `startAtMs` on that clock. A group still starts its clips in order.
Each receipt entry reports `throughMs` and the rendered `interval` on the same clock.
A caller can start later output relative to that interval, for example 2 seconds after a clip ends.
Lanes, anchors, and late-producer policies are proposed in [the playback clock ADR](../adr/2026-10-05-schedule-playback-on-the-driver-clock.md).

## Resources and errors

Audio adapters own stream backpressure, transport buffers, and media cleanup.
The caller contract imposes no observer, capture, playback-group, recording-duration, or byte quotas.
History retention follows the caller's requested pre-roll. It does not determine detector window size.
Timeouts are optional operation policy. No fixed finalization or cleanup deadline applies to every adapter.

The worklet transport coordinates buffer transfer with its receiver. Transport buffering stays inside that adapter.
A slow live consumer cannot pause the physical microphone. The adapter reports lost samples or failure instead of claiming a complete recording.
Source gaps fail affected captures and reset observers. No layer silently fabricates missing speech.
The runtime releases readers and closes owned AudioData after copying samples.
Detectors own copies that they retain and the resources that their model calls allocate.
Cancellation revokes publication immediately. Plugins own work that ignores abort. Worker termination belongs to the model adapter.
The runtime does not reserve plugin memory or reject unrelated subscriptions because an earlier plugin call remains pending.

## Caller checks

Independent callers receive only this document and the declarations.
They must write examples without reading production internals or asking the author for hidden assumptions.

1. Hold PTT, release during fade, then use toggle and a file voice message.
2. Send PCM to Hearing before finish and retain the same capture as a file.
3. Add VAD and slow speaker identification without extra audio nodes.
4. Run turn detection and explain rejection after transcript revision or cancellation.
5. Interrupt session A while B continues. Explain late TTS, fade failure, and agent notification ownership.

Successful examples preserve resource ownership, cancellation scope, stream backpressure, and completion ordering.
Typechecking proves call compatibility only. It does not prove runtime timing, model quality, or user comprehension.
