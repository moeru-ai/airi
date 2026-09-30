# Audio adapters

`@proj-airi/audio` owns browser audio resources and format conversion.
`@proj-airi/pipelines-audio` owns capture intervals, observation windows, and playback groups.

## Use it for

- Request microphone access and release physical tracks.
- Convert PCM to encoded files or provider input formats.
- Play files or streamed PCM through Web Audio.
- Fade owned playback nodes before reporting silence.

## Microphone ownership

Create one `Microphone` for each physical connection. Each consumer acquires its own lease.
Call `acquire()` during the user gesture. Permission and AudioContext resume start immediately.
Release the lease after capture and encoding finish.
The last release closes the connection, including tracks returned by a late permission response.

```ts
import { Microphone } from '@proj-airi/audio/browser'

const microphone = new Microphone({ audio: { echoCancellation: true } })
const lease = microphone.acquire()
const audio = await lease.input
const capture = audio.capture({
  delivery: 'file',
  file: { mimeType: 'audio/wav', sampleRate: 16000, channels: 1 },
})

// Call finish when the control is released. Cancellation discards this interval.
const outcome = await capture.finish()
await lease.release()
if (outcome.status === 'finished')
  showPreview(outcome.value)
```

`Microphone.close()` forcibly closes the physical connection. Use it for device replacement or permission revocation.
A borrowed AudioContext remains owned by its caller.

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
Browser tests cover Web Audio, permission startup, shared leases, and track cleanup.
