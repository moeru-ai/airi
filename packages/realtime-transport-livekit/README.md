# @proj-airi/realtime-transport-livekit

The media plane of realtime calls. It joins a LiveKit room and moves audio tracks. It runs in a browser, an Electron renderer, or a Capacitor WebView.

## Use it

```ts
import { joinCall } from '@proj-airi/realtime-transport-livekit'

const media = await joinCall(access, {
  onRemoteAudio: stream => play(stream),
  onState: state => console.info(state),
  onPeerLeft: () => endCall(),
})
await media.publishAudio(microphoneTrack)
await media.leave()
```

`access` comes from `POST /api/v1/realtime/calls/:callId/access` of the hosted API.

## When to use it

- To send and receive the audio of a call between two devices of one account.

## When not to use it

- For call control or other small events. Use the contracts of `@proj-airi/realtime-protocol` on the message plane.
- For audio between windows of one device. Use the playback of `@proj-airi/pipelines-audio`.
