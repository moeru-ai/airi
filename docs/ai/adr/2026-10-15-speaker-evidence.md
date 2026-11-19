# Speaker evidence in shadow mode

Status: accepted

## Context

The speaker gates will start a voice input only for the enrolled owner. A gate needs a threshold that separates the owner from other people and from the echo of the character.

Sherpaw tuned its focus threshold, a cosine of 0.35 for each 0.25 s step, on unprocessed audio. AIRI records with echo cancellation, noise suppression, and automatic gain, so its scores can differ. AIRI needs its own score distributions before a gate uses a threshold.

`@proj-airi/core-agent` already carries speaker evidence. `updateSpeakerEvidence` accepts evidence for audio inside an input until its transcription ends, and the submission carries the newest evidence. Before this change, no code wrote evidence.

## Decision

### Speaker recognition setting

The Voiceprint settings page has a Speaker recognition switch. It is off by default, and it is available only with a usable voiceprint.

While the voice host listens with the switch on, the speaker tracker Worker stays loaded with the voiceprint. The host releases the Worker when listening stops, the switch turns off, or the voiceprint is deleted.

### Comparison

`createSpeakerEvidencePlugin` compares 1 s of audio with the owner every 250 ms. These are the defaults of Sherpaw `similarity`. The owner is speaker 0 of the tracker, because the tracker enrolls only the saved voiceprint.

The plugin compares only windows inside the active input, as `acceptsEvidence` of the input decides. It uses `latest` scheduling, so a busy Worker skips windows instead of queuing audio.

Each comparison uses the window as mono PCM clamped to [-1, 1]. The tracker throws a `RangeError` for any other sample, and loud sound near the microphone can give samples slightly above 1. The wake word detector and the voiceprint enrollment use the same `toMonoSamples`.

A comparison counts when the VAD marked at least half of its audio as speech. Pauses then do not lower the score. The voice activity plugin reports each VAD window of an input through `onActivity`, which now carries the window range. A comparison waits until these VAD results reach its end. A window without an embedding gives NaN and does not count.

### Evidence

After each new counted comparison, the plugin writes this evidence to the input:

- One candidate, `owner`, with the mean cosine of the counted comparisons.
- `voicedMs`: the VAD speech between the start of the first counted comparison and the end of the last one.
- The range of the same audio.

### Prompt

The chat prompt does not include speaker evidence. `formatSpeechContext` leaves it out. The cosine has no calibrated threshold yet, and the model can read a low score as another person. The speaker gates decide what the model receives.

### IO trace

The `Voice input` span records the newest evidence that the plugin computed, even when the input rejected it:

- `speaker.score`: the mean cosine.
- `speaker.scores`: the cosine of each counted comparison, in time order. A gate that decides early can use the first values.
- `speaker.voiced_ms`: the speech behind the score.
- `speaker.rejected_count`: the updates that the input rejected, mostly because its transcription had ended.

### Failures

A failed comparison reports the error and releases the Worker. A broken Worker therefore does not fail every window. The next change of the switch or the voiceprint loads the Worker again.

A release ends the comparisons that still run, for example when listening stops or the switch turns off. They have no score and report no error. After a voiceprint change, a comparison waits until the tracker has enrolled the new voiceprint, because the tracker has no speakers between `reset` and `enrollVoiceprint`.

## Consequences

- Speaker evidence only measures. It does not begin, end, or cancel an input, and the model receives nothing new.
- Manual inputs, for example Push to Talk, get no evidence. The voice activity plugin does not follow them, so no comparison has VAD results.
- Evidence that arrives after the transcription ends is rejected. The rejected count shows how often the submitted evidence was older than the newest one. It decides whether core-agent keeps speaker evidence writable until submission.
- The scores come from the processed speech input, the same input as the enrollment.
- While the host listens with the switch on, the Worker keeps the CAM++ model in memory. The model pack is about 28 MB. Each second of input runs 4 comparisons. Neither the memory nor the CPU use is measured.
- To collect score distributions, turn on Speaker recognition and IO trace recording on desktop, and use voice input for several days. Inputs of the owner, of other people, and of the character's echo then give the scores for the gate threshold.

## Verification

Unit tests run the voice activity plugin and the speaker evidence plugin on one controller with a fake comparison. They cover the counted comparisons, the speech share rule, windows without an embedding, the evidence in the submission, and the switch.
Other tests cover the trace attributes, the prompt without speaker evidence, the comparison and the clamping of the tracker store, and the Voiceprint page switch.
The voice store wiring has no test, because no test mounts `useVoiceStore`.
A real microphone with the CAM++ model is not tested.
