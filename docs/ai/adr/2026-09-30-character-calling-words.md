# Character calling words

- Status: Accepted
- Scope: Calling-word configuration, model assets, and browser detection

## Context

A character can respond to several spoken names. Each name can have several pronunciations.
The selected keyword model accepts encoded tokens. It does not convert ordinary text into pronunciation tokens.
Imported cards can claim the same pronunciation or contain tokens from another model.

## Decision

Store names and pronunciations in `AiriExtension.modules.wakeWords`. Keep optional score and threshold overrides beside their keyword or pronunciation.
Validate complete replacements before the card store commits them. Preserve unsupported imported pronunciations and expose validation errors for correction.

Keep pronunciation ownership on the device. When imported cards share a pronunciation, disable that pronunciation until the user selects its owner.
Importing another claimant clears the previous ownership choice. Exports contain calling words but exclude ownership choices.
The synchronization leader owns card writes and ownership changes. Replicated snapshots update projections without triggering write actions.

The configuration tool captures its character ID when constructed. Later character selection changes cannot redirect that tool call.
It accepts the complete replacement list, including an empty list to clear calling words.
The tool resolver accepts an explicit character ID from the conversation owner.

Reuse the Sherpaw Vite plugin for preload artifacts. Its contract describes artifact locations without requiring ASR-specific metadata.
Pin the bilingual Zipformer model and its token vocabulary to one revision.
Web loads remote artifacts on demand. Desktop and Pocket can bundle those same artifacts.

`KeywordListener` owns a Worker and a Web Audio graph. The caller owns the microphone stream.
The listener sends normalized PCM in 100 ms batches. A detection pauses keyword recognition before notifying the caller.
After each asynchronous boundary, a generation check prevents stopped listeners from delivering detections.
The application decides when to resume listening and where to send the captured utterance.

## Boundaries

This change supplies configuration and detection primitives. It does not activate automatic microphone input.
Foreground wake handling, recording modes, visual status, and native mobile detection have separate integration steps.
Session ownership supplies the character ID for tool registration. This module does not change conversation selection or audio history storage.

## Consequences

Cards remain portable while pronunciation conflicts follow each device's installed characters.
The pinned vocabulary makes validation deterministic. A future model change requires an explicit vocabulary and card migration decision.
KWS preparation remains separate from transcription. Both runtimes can evolve without sharing cancellation state.
