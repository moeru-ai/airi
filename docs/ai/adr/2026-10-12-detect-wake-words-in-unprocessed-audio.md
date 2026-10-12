# Detect wake words in unprocessed audio

Status: accepted

Supersedes the audio source and search settings of [Detect wake words in shared audio](./2026-10-09-detect-wake-words-in-shared-audio.md).
The catalog, the Worker, the queue, and the input mode rules of that record stay.

## Context

Live calls of a wake word did not wake a character in stage-tamagotchi. Each layer was examined in the running app on 2026-10-12:

- The detector received 16 kHz windows, the spotter processed every batch, and the catalog had the expected pronunciations.
- The spotter returned no match in about 28 minutes of microphone audio that contained repeated calls.
- The same pinned model matched the same keyword in synthesized speech and in the upstream sherpa-onnx test recordings.
- A recording of the user's calls matched only after three changes:
  - tone variants of the last syllable, because the user said `lù` or `lú` while the card stored `lū`
  - a new spotter stream in each pause: one match in a continuous stream, three with a reset at each pause
  - the search settings of the Sherpaw sandbox presets

The Sherpaw sandbox detects the same keyword in live speech. It differs from AIRI in two ways:

- It opens the microphone without echo cancellation, noise suppression, or automatic gain.
- It uses 16 active paths, keyword boost 1.5, and threshold 0.1. AIRI used the sherpa-onnx defaults: 4 paths, boost 1, and threshold 0.25.

## Decision

- `useAudioDevice` provides two inputs for the selected device:
  - `input` keeps browser processing. VAD, capture, and level meters use it.
  - `unprocessedInput` has no browser processing. Only keyword spotting uses it.
  - Chromium opens both captures of one device with their own settings. A device change replaces both.
- `WakeWordDetector.listen(input, signal)` observes `unprocessedInput` in 100 ms windows.
  `useWakeWordDetectionStore` keeps that listen only while the catalog has an active pronunciation of the pinned model.
  A device without wake words does not open the second capture.
- The voice activity plugin still owns wake admission. On each of its windows, it calls `detectWakeWord` with its VAD result.
  The detector returns a resolved wake, and starts a new spotter stream after 0.5 seconds of VAD non-speech.
- `kwsSearch` holds the search settings of the pinned pack: 16 active paths, boost 1.5, and threshold 0.1.
- `kwsToneVariants` adds tone variants to each card pronunciation. Each variant changes the tone of one pinyin final.
  The count grows linearly with the syllable count. A card pronunciation keeps its token sequence when a variant of another card equals it.

## Consequences

- Keyword spotting and VAD read separate captures of one device. Their windows are not frame-aligned, so the VAD result marks pauses only approximately. A pause of 0.5 seconds absorbs that difference.
- macOS voice processing cancels audio that the system plays. A test that plays speech through the speakers can reach the unprocessed capture but not VAD.
- Threshold 0.1 can raise false wakes. Per-pronunciation settings stay out of the card schema until recordings show false wakes.
- Card pronunciations still come from the character. English names are fragile: for example, the Sherpaw preset maps "Iru" to `IY1 L UW0`, not `IY1 R UW1`.
