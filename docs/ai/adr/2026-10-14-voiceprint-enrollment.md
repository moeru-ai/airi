# Voiceprint enrollment and storage

Status: accepted

## Context

Speaker tracking needs the voice of the device owner. The Sherpaw speaker tracker enrolls a person from at least 5 seconds of their speech. `voiceprint(speaker)` returns an embedding and the seconds of speech behind it, so an application can save the voice without the audio.

A voiceprint contains no audio, but it identifies a person. Privacy rules treat such data as biometric data. This decision is not legal advice.

The voice host is the window that mounts the Stage. It owns the microphone, voice activity detection, and wake words. Other windows read its state and send commands through the speech bus.

## Decision

Only one person can enroll: the device owner. A new enrollment replaces the saved voiceprint.

### Recording

`useVoiceEnrollmentStore` in the voice host records one enrollment. It uses the speech input of the host, the input that voice activity detection and transcription read. That input has echo cancellation, noise suppression, and automatic gain on.

The enrollment keeps only the 32 ms windows that Silero VAD scores as speech. A window starts speech at a score of 0.6, and speech continues while the score stays at 0.18. These are the thresholds of the voice activity plugin. Silence weakens a voiceprint, so it is not kept.

Recording stops with the Finish command or after 30 seconds of audio. With less than 5 seconds of speech, the enrollment fails as `too-short`, and the user records again.

The voiceprint model runs in a tracker Worker of its own. The Worker ends when the voiceprint is computed. The recorded speech exists only in memory until the enrollment settles.

While an enrollment records, the voice activity plugin does not begin inputs. The enrollment prompt can contain a wake word, and the wake word must not start a chat turn.

Other windows send `voiceEnrollmentCommand` (`begin`, `finish`, `cancel`) and read `voiceEnrollmentChanged`. A window without a connected voice host runs the enrollment itself. This is the case for the stage-web settings page, because the Stage unmounts there and nothing listens to the microphone.

### Storage

`useVoiceprintStore` keeps the voiceprint in local storage under `settings/voice/voiceprint`. The record holds the embedding, the seconds of speech, the creation time, the model ID and revision, and the input that recorded it.

A record from another model revision is outdated. The speaker tracker does not enroll it, and the settings page asks the user to enroll again. The Sherpaw README states that an embedding from another model does not match, even with the same length.

The voiceprint stays on the device:

- Character card export does not include it.
- No code sends it to a server.
- Chat history and IO traces do not include it.

The voiceprint does not expire. The user deletes it on the Voiceprint settings page, or with Delete all data.

Desktop does not encrypt the voiceprint with Electron `safeStorage`. Web and Pocket have no matching mechanism, and the same store serves all hosts.

### Consent

The Voiceprint settings page tells the user what a voiceprint is, that it stays on the device, and how to delete it. Enrollment starts only from the user's click on that page.

## Consequences

- No feature reads the voiceprint yet. Speaker evidence and the speaker gates read it later through `useSpeakerTrackerStore`.
- The recording uses the processed speech input. The Sherpaw tuning used unprocessed audio. The voiceprint measurement in the Sherpaw sandbox decides whether this choice stays. A change of input makes saved voiceprints outdated, because the record names its input.
- An enrollment with two voices fails with the tracker's error, and the user records again alone.

## Verification

Unit tests cover the speech selection, the 5-second minimum, the 30-second limit, cancellation, and model failures with a fake VAD and a fake voiceprint model.
Browser tests cover the settings page with a fake voice host, outdated records, deletion, and Delete all data.
A real enrollment with a microphone and the CAM++ model is not covered by tests.
