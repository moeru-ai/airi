# Apple Speech Transcription

This package is a macOS-only proof of concept for Apple system speech transcription in Electron. It uses `SpeechAnalyzer` and `SpeechTranscriber` through a Swift static library and a raw Node-API bridge.

## When to use it

Use this package in the Electron main process on macOS 26 or later. It transcribes files and live mono PCM16 audio. The first request for a locale can download a system-managed model.

Do not import the native binding in a renderer process. Do not show this provider on Windows, Linux, older macOS versions, or Macs where `SpeechTranscriber` reports that it is unavailable.

## Build

```bash
pnpm -F @proj-airi/apple-speech-transcription build
```

The build uses the installed Swift compiler, Clang, and Node headers. Set `NODE_INCLUDE_DIR` only when the active Node installation does not keep `node_api.h` under its prefix.

## Try a file

```bash
pnpm -F @proj-airi/apple-speech-transcription smoke -- /absolute/path/to/audio.wav en-US
```

The command prints runtime capabilities and the final transcript. It also reports the native processing time. Model download time is included when the locale asset is not installed.

## Stream live audio

Call `transcribePcmStream()` with 16 kHz, mono PCM16 audio chunks. The function yields complete transcript snapshots. Replace the prior snapshot with each new `text` value.

Do not append these snapshots. Apple can revise volatile words and punctuation before it finalizes an audio range.

## AIRI integration

The Electron renderer keeps AIRI's microphone selection and VAD pipeline. Each VAD segment crosses the Eventa boundary as a PCM stream. The Electron main process sends the stream to this package and returns replaceable transcript snapshots.

This package does not own microphone capture. The provider is available only in the Electron app on supported macOS systems. Web, Windows, Linux, and older macOS systems do not show it.
