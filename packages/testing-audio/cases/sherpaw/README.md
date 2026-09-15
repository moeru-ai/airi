# Sherpaw audio verification

The Web and Electron cases run the real bundled ASR models, real VAD inference, and the
existing two-utterance fake-microphone recording. Each case changes the language
group away and back through Hearing settings, then checks two final segments and
intermediate text. Sherpaw model downloads are blocked during the run. Hosted
Provider synchronization is unavailable so configuration uses local persistence.

Run after building stage-web and stage-tamagotchi:

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm -F @proj-airi/testing-audio exec vitest run cases/sherpaw/case.audio.test.ts
```

The test downloads the real Silero VAD model before recording starts. Set
`TESTING_AUDIO_VAD_MODEL_PATH` to a local copy to avoid that download; the test
checks its SHA-256 hash. The installed Transformers.js runtime files are served
through test fixtures. Web uses browser routes. Electron uses an HTTPS protocol
handler. VAD and ASR inference are not mocked.

## Measured result

On 2026-09-15, all four Web and Electron cases passed with `@sherpaw/xsai-transcription` 0.0.2.
The recording repeats:

> Microphone warm up, microphone warm up. Hello AIRI please say hello.

Examples from completed segments:

| Model group | Output |
| --- | --- |
| Chinese / English | microphone warm up microphone warm up hello erry please say hel |
| Eight languages | MICROPHONE WARM UP MICROPHONE WARM UP HELLO AIRY PLEASE SAY HELLO |

The bilingual model can omit words or truncate the final word in this English
sample. Its exact output varies between segments and runs. The assertions check the warm-up phrase, `hello`, and `say`, not exact
text. This is an integration check, not an accuracy benchmark. Chinese and the
other supported languages have not been measured with this fixture.

Raw final text and intermediate updates are written to
`.cache/sherpaw-checks/recognition-<target>-<group>.json` at the repository root.

## Electron regression

Two independent test-environment failures prevented transcription:

- Playwright 1.62.1 enables CDP Fetch interception for every URL when a route exists.
  Electron 43 can omit the matching Network event for a local AudioWorklet request.
  Playwright then leaves the request paused, and `AudioWorklet.addModule()` never resolves.
  Electron fixtures now use an HTTPS protocol handler, which leaves local file requests alone.
- On this macOS host, the physical audio output stalled the Web Audio clock at approximately 5 milliseconds.
  The context reported `running`, but its analyser returned zeros and VAD received no speech.
  Web and Electron tests now use `--disable-audio-output` to drive a virtual output.
  This keeps real audio graph processing without a physical speaker.

The protocol handler belongs to the isolated test process and closes with that process.
Unmatched HTTPS requests use the built-in network handler. Remote Sherpaw downloads remain blocked.
The output switch follows [Chromium's virtual output behavior](https://chromium.googlesource.com/chromium/src/+/f29eb01290cd36a30177ecf8197f906c01088a0d).
The fixtures follow [Electron's protocol forwarding API](https://www.electronjs.org/docs/latest/api/net#netfetchinput-init).
These changes affect the test environment. They do not change production audio processing.

## Upstream defect

Creating a recognizer with missing model files returned a null native handle and
later failed with an opaque WASM error. A real-WASM regression test and an early
error check were submitted in [sherpaw PR #7](https://github.com/moeru-ai/sherpaw/pull/7).
The AIRI integration uses published 0.0.2 and does not depend on that pending PR.
