# Share audio sources by subscription

Status: accepted

## Context

The first voice refactor gave each input kind its own ownership API. `Microphone` returned a lease with a pending input and a `release` call. `AudioInput` took browser media adapters and offered four capture delivery formats. The voice controller acquired or borrowed audio and tracked permission promises. Audio files could not enter the same path as the microphone.

Each layer repeated abort controllers, settled flags, cleanup arrays, and paired abort listeners.

## Decision

- An `AudioInputSource` has one operation: `open(signal)` returns a PCM stream. A microphone, a borrowed MediaStream, and a decoded file are sources.
- `AudioInput` shares one source. The first subscriber opens it, and the last one to leave closes it. Each subscription ends with its own abort signal.
- `capture`, `observe`, and `audioWindows` are functions over an input. Encoding with `encodeWav` and track output with `toMediaStream` are separate functions.
- Transcription providers receive PCM only. A provider adapter converts PCM to a file or tracks when its API requires that format.
- The voice controller holds a shared input and never closes it. `replaceAudio` moves attempts and plugin observations to a new input.
- `createScope` owns one lifetime: an abort signal, reverse-order cleanups, and child scopes.

## Consequences

- Consumers do not release leases. A consumer that stops reading also stops holding the device.
- An input is admitted when its source delivers the first block. This state also covers microphone permission.
- Stored recordings reach every configured provider through `fileSource`, not only providers that accept files.
- The browser adapter still captures at 16 kHz for Silero VAD. Firefox cannot connect a device to a context at another rate. The source code marks this with `NOTICE`.
