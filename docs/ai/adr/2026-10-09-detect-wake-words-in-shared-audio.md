# Detect wake words in shared audio

Status: accepted

## Context

Character cards store wake words and model token pronunciations. `useWakeWordsStore` resolves the device-local catalog of active pronunciations.
The voice activity plugin has a `detectWakeWord` entry point. `useVoiceStore.resolveWakeTarget` selects the session of a character.
No detector used these entry points.

An earlier branch (#2726 and #2730) added a keyword listener with its own AudioContext and AudioWorklet.
The voice pipeline now shares one audio input between VAD, capture, and level meters. A second audio graph duplicates capture and its lifecycle.

## Decision

`WakeWordDetector` in `stage-ui/src/libs/voice` reads the ordered 32 ms windows that the voice activity plugin observes.
It owns one Sherpaw keyword spotter Worker. It does not own a microphone, an AudioContext, or an AudioWorklet.

The detector downmixes each window to mono. It replaces non-finite samples with 0 and clamps the others to [-1, 1].
It queues 100 ms batches for the spotter. Sherpa-ONNX resamples them to the model rate. A gap or a sample rate change resets the stream.

Recognition runs off the ordered window path. The voice activity observer uses `ordered` scheduling and fails after 60 seconds of backlog.
If each window waited for the Worker, a Worker slower than real time would delay VAD and then end the observation.
The detector returns at once instead. A resolved wake arrives on a later window. A recognition backlog over 1 second is dropped, because a late wake is not useful.

Each keyword label is a catalog pronunciation key. A match reads the current catalog, then calls `resolveWakeTarget`.
A pronunciation that became inactive during recognition cannot wake a character. An owner change uses the new owner without a keyword rebuild.
A stop or a keyword rebuild discards a late result. Detection never rejects, because a rejection ends the shared observation.

`useWakeWordDetectionStore` owns the running detector and exposes its preparation: `unconfigured`, `preparing`, `ready`, or `error`.
`voice.startListening` starts it when the host supplies no `detectWakeWord`. The model loads only when the catalog has a pronunciation for the pinned model.

The pinned model is the Chinese and English Zipformer 3M KWS pack at one revision. Its token list is copied into the repository.
The keyword tool and card validation use this list without a model download. Control tokens such as `<unk>` are not valid pronunciations.

The `configure_wake_words` tool edits the character that owns the turn's session. It captures that ID before the request starts.
It returns `saved` with the conflicts of the edited character, or `rejected` with a reason. The card does not change on rejection.

## Consequences

Wake word detection and VAD read the same audio and stop together.
After a wake, the plugin starts an input with `after-silence`. The same character's later matches do not start another input.

Recognition accuracy depends on model token pronunciations that the character writes. No text-to-token conversion exists.
A new model revision requires a new vocabulary file and a decision about cards that store the old `modelId`.

## Follow-up

The Push to Talk work adds `inputMode` to the hearing store. A later change adds `wake-word` to that mode.
In `wake-word` mode, the voice store `target()` option returns undefined. Then VAD alone cannot start an input, and only a wake can.
The listener gating moves next to the mode selection in `voice.startListening`.

Score and threshold settings per pronunciation are not in the card schema. Add them only if real recordings show false wakes or missed wakes.
