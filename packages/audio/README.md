# Audio adapters

`@proj-airi/audio` owns browser audio resources and format conversion.
`@proj-airi/pipelines-audio` owns capture intervals, observation windows, and playback groups.

## Use it for

- Open a microphone, a borrowed MediaStream, or an audio file as a PCM source.
- Encode PCM as WAV, or convert PCM to provider input formats.
- Play files or streamed PCM through Web Audio.
- Fade owned playback nodes before reporting silence.

## Audio sources

A source is an `AudioInputSource`. Its `open(signal)` call returns a PCM stream. Aborting the signal releases the connection.

| Source | Module | Owner of the tracks or data |
| --- | --- | --- |
| `microphoneSource(constraints, options)` | `@proj-airi/audio/browser` | The source. It stops the tracks and closes its AudioContext. |
| `mediaStreamSource(stream, context)` | `@proj-airi/audio/browser` | The caller. The source disconnects only its own nodes. |
| `fileSource(blob)` | `@proj-airi/audio/encoding` | The caller. Mediabunny decodes the file for each connection. |

Wrap a source in an `AudioInput` to share it. Each consumer subscribes with its own signal.

```ts
import { microphoneSource } from '@proj-airi/audio/browser'
import { encodeWav } from '@proj-airi/audio/encoding'
import { AudioInput, capture } from '@proj-airi/pipelines-audio'

const input = new AudioInput(microphoneSource({ audio: { echoCancellation: true } }), { historyMs: 360 })

// Start this in the click handler. getUserMedia starts before the first await.
const recording = capture(input)
const wav = encodeWav(recording.stream, { sampleRate: 16000, channels: 1 })

// Call finish when the control is released. Call cancel to discard the interval.
await recording.finish()
showPreview(await wav)
```

The first subscriber opens the microphone. The last subscriber to leave stops the tracks. A late permission result after that point stops its tracks immediately.

`toMediaStream(stream, context, signal)` plays PCM into new tracks. Use it for APIs that accept only a MediaStream, such as Web Speech recognition.

## Playback

```ts
import { BrowserPlayback } from '@proj-airi/audio/browser'
import { Playback } from '@proj-airi/pipelines-audio'

const playback = new Playback(new BrowserPlayback(audioContext))
const group = playback.openGroup('answer')
void group.enqueue({ id: 'first', audio: audioBlob })
const receipt = await group.stop({ fadeMs: 100 })
```

The stop receipt follows the audio clock and source completion. It does not rely on a UI timer.
The caller owns `audioContext` and closes it after its consumers finish.

## Do not use it for

- Character routing, chat persistence, or agent notifications.
- VAD policy, wake-word matching, memory search, or transcript rewriting.
- Vue state or cross-window commands.

## Checks

Run `pnpm -F @proj-airi/audio typecheck` and its Vitest projects.
Node tests cover WAV encoding and file decoding. Browser tests cover Web Audio, microphone sharing, late permission, and track cleanup.
