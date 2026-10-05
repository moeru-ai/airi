# Share audio sources by subscription

Status: accepted

## Context

The first voice refactor gave each input kind its own ownership API. `Microphone` returned a lease with a pending input and a `release` call. `AudioInput` took browser media adapters and offered four capture delivery formats. The voice controller acquired or borrowed audio and tracked permission promises. Audio files could not enter the same path as the microphone.

Each layer repeated abort controllers, settled flags, cleanup arrays, and paired abort listeners.

## Decision

- An `AudioSource` has one operation: `open(signal)` returns a PCM stream. A microphone, a borrowed MediaStream, and a decoded file are sources.
- A `LiveAudioSource` adds `live: true`. It produces audio in real time and cannot wait for its reader. A microphone and a borrowed MediaStream are live. A file is not live.
- `AudioInput` shares one live source. The first subscriber opens it, and the last one to leave closes it. Each subscription ends with its own abort signal.
- Each open call is one connection. The connection owns its subscribers, position, and history. A new connection starts empty.
- `capture`, `observe`, and `audioWindows` are functions over an input. Encoding with `encodeWav` and track output with `toMediaStream` are separate functions.
- Transcription providers receive PCM only. A provider adapter converts PCM to a file or tracks when its API requires that format.
- The voice controller holds a shared input and never closes it. `replaceAudio` moves attempts and plugin observations to a new input.
- `createScope` owns one lifetime: an abort signal, reverse-order cleanups, and child scopes.

## Consequences

- Consumers do not release leases. A consumer that stops reading also stops holding the device.
- An input is admitted when its source delivers the first block. This state also covers microphone permission.
- Stored recordings reach every configured provider through `fileSource`, not only providers that accept files.
- Each consumer of a file opens its own stream with `fileSource(blob).open(signal)`. The reader sets the decode speed, so a slow consumer slows only its own stream.
- `new AudioInput(fileSource(blob))` is a type error. A shared file has no live pace, so a slow reader fails instead of waiting. The #2769 review found this.
- A source must give each connection a new `sourceId`. If a source reuses the id of its previous connection, the subscribers fail.
- The browser adapter still captures at 16 kHz for Silero VAD. Firefox cannot connect a device to a context at another rate. The source code marks this with `NOTICE`.
