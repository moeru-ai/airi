# Voice output plugins and the playback output

Status: proposed

## Context

Voice plugins covered only the input side. `observeAudio` read the microphone, and `onSpeechInput` ran for each speech input. The output side had no extension point, so each consumer of the played speech had its own path:

| Consumer | Old path | Problem |
| --- | --- | --- |
| Live2D lip sync, spectrum analyser | `Stage.vue` connected them to a `speechAnalysis` node | Wiring in a component |
| VRM and MMD lip sync | `BrowserPlayback.onSource` gave each clip source to `Stage.vue`, which passed the newest one through props | Overlapping streamed parts were missed. The mouth read the audio before the clip fade. |
| Speech output IO trace | It wrapped the `speech(turn)` factory and decoded each segment again | Streamed speech had no level |
| MAGIC speaking profile | `Stage.vue` watched the voicing state and sampled an analyser | Wiring in a component |

## Decision

### The playback gives its output

- `PlaybackDriver<TNode>` can give `output`, a `LiveAudioSource` of the mixed audio that it plays, and `connect(node)`, which connects a node of the platform graph to that mix. `TNode` is `AudioNode` in a browser. A driver without a graph keeps `never`.
- `Playback` shares `output` as an `AudioInput` and forwards `connect`. `observe()` and `observeLevel()` work on played audio as on a microphone.
- `levelOf()` and `observeLevel()` move from stage-ui to `@proj-airi/pipelines-audio`, so the microphone and the speech use one level scale.
- `BrowserPlayback` plays every clip into one mix node. The mix is after the clip fades and before the destination, which holds the user volume. `output` taps the mix with the capture worklet, and `connect` connects a node to it. `onSource` is removed.

### Voice plugins get an output side

The scope has one `onXxx` hook for each stage of a turn, and the audio of both sides for the life of the plugin:

```ts
interface VoicePluginScope<TNode = never> {
  onInput: (install: (input: SpeechInputScope) => void | Promise<void>) => void
  onOutput: (install: (output: SpeechOutputScope) => void | Promise<void>) => void
  input: { observe: (window, run) => Observer }
  output: { observe: (window, run) => Observer, connect?: (node: TNode) => void }
  // signal, emit, on, rule, revisions, conversationContext, cancel, fail, onDispose
}
```

- `onInput` replaces `onSpeechInput`, and `input.observe` replaces `observeAudio`. Their behavior does not change.
- `onOutput` runs once for each response. Its scope gives the turn, a signal that aborts when the response closes, the controls of the plugin grants, and `on(type, listener)` for the events `tts-request`, `tts-result`, `playback-start`, `playback-end`, and `token-special`. The names follow `SpeechPipelineEvents`. `segmentId` joins the synthesis and the playback of one segment.
- `VoiceResponse` emits the events from inside its producers. A failing listener is reported with the stage `output` and the turn. The speech continues.
- The controller takes `playback` and `replacePlayback()`, like `audio` and `replaceAudio()`. A replaced playback moves the output observations and connections of every plugin.
- `VoicePlugin<TNode>` follows the controller. A `VoicePlugin` (`never`) installs on every host. A `VoicePlugin<AudioNode>` installs only on a host with a Web Audio graph.

### Consumers become plugins

- The speech level is a plugin. It observes the playback output from the first played segment of a response until the last voicing response closes, and publishes `speechOutputLevel` on the speech bus.
- Lip sync and the analyser connect through `voice.connectSpeechNode(node)`, which installs a plugin that calls `output.connect`. Live2D, VRM, and MMD receive one `connectSpeech` function instead of a source prop.

## Consequences

- No component wires the played speech. The stage creates the playback and gives it to the voice host.
- The lip sync of VRM and MMD hears every streamed part, and the mouth follows the fade of an interruption.
- The output trace still wraps the speech factory. It records the decoded audio duration of each segment, and a plugin has no access to that audio. A follow-up can move it to `onOutput` and `output.observe`, with the duration from the playback receipt.
- While a response voices, the level tap posts one message for each render quantum to the main thread.
