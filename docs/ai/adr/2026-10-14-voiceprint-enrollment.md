# Voiceprint enrollment and storage

Status: accepted

## Context

Speaker tracking needs the voice of the device owner. The Sherpaw speaker tracker enrolls a person from at least 5 seconds of their speech. `voiceprint(speaker)` returns an embedding and the seconds of speech behind it, so an application can save the voice without the audio.

A voiceprint contains no audio, but it identifies a person. Privacy rules treat such data as biometric data. This decision is not legal advice.

The voice host is the window that mounts the Stage. It owns the microphone for chat input, voice activity detection, and wake words. Other windows read its state and send commands through the speech bus.

## Decision

Only one person can enroll: the device owner. A new enrollment replaces the saved voiceprint.

### Recording

The Voiceprint settings page records the enrollment in its own window with `useVoiceEnrollment`. The enrollment belongs to the page. It ends when the page unmounts or the window closes, and it then saves nothing.

The page records from the selected microphone through the speech input, the input that voice activity detection and transcription read. That input has echo cancellation, noise suppression, and automatic gain on. The transcription playground in the provider settings records in the settings window in the same way.

The enrollment keeps only the 32 ms windows that Silero VAD scores as speech. A window starts speech at a score of 0.6, and speech continues while the score stays at 0.18. These are the thresholds of the voice activity plugin. Silence weakens a voiceprint, so it is not kept.

Recording stops with Finish or after 30 seconds of audio. With less than 5 seconds of speech, the enrollment fails as `too-short`, and the user records again.

The voiceprint model runs in a tracker Worker of its own. The Worker ends when the voiceprint is computed. The recorded speech exists only in memory until the enrollment settles.

### Microphone ownership

While the enrollment records, it holds a capture lease on the speech bus (`voiceCaptureLease`). The voice host follows leases with `useVoiceCaptureLeaseStore`. While any lease holds, the host does these things:

- The voice activity plugin begins no input, so speech and wake words cannot start a chat turn.
- Manual inputs, for example Push to Talk, do not begin, and a running one is cancelled.
- Voice messages do not record. A voice message that records when the lease starts is finished and kept as a draft.

The holder renews the lease every second, and a lease ends 3 seconds after its last renewal. A window that closes without a release therefore cannot keep the host paused. The level monitor of the voice controls uses the same renewal pattern.

On stage-web, the Stage unmounts on settings pages, so no host runs while the page records. The lease then has no effect.

### Rejected: enrollment in the voice host

The first version ran the enrollment in the voice host, and other windows controlled it with commands through the speech bus. The stage-web settings page has no host, so that version also needed a local fallback. The design then needed these parts: a mirrored enrollment state, a host discovery race, a cancel when the controlling page left, and two flags that tracked which window started the enrollment. Each part caused a review finding. An enrollment is an operation that the user attends on one page, so the page owns it now. The host only needs to know that another window uses the microphone alone.

### Storage

`useVoiceprintStore` keeps the voiceprint in local storage under `settings/voice/voiceprint`. The record holds the embedding, the seconds of speech, the creation time, the model ID and revision, and the input that recorded it.

A record from another model revision is outdated. The speaker tracker does not enroll it, and the settings page asks the user to enroll again. The Sherpaw README states that an embedding from another model does not match, even with the same length.

The voiceprint stays on the device:

- Character card export does not include it.
- No code sends it to a server.
- Chat history and IO traces do not include it.

The voiceprint does not expire. The user deletes it on the Voiceprint settings page, or with Delete all data.

A deletion also saves its time under `settings/voice/voiceprint-deleted-at`. An enrollment that started before the last deletion does not save. A deletion in another tab stops a save only after the deletion reaches the tab of the enrollment. Delete all data removes the voiceprint before its other steps, so a failed step cannot keep it.

Desktop does not encrypt the voiceprint with Electron `safeStorage`. Web and Pocket have no matching mechanism, and the same store serves all hosts.

### Consent

The Voiceprint settings page tells the user what a voiceprint is, that it stays on the device, and how to delete it. Enrollment starts only from the user's click on that page.

## Consequences

- No feature reads the voiceprint yet. Speaker evidence and the speaker gates read it later through `useSpeakerTrackerStore`.
- The recording uses the processed speech input. The Sherpaw tuning used unprocessed audio. The voiceprint measurement in the Sherpaw sandbox decides whether this choice stays. A change of input makes saved voiceprints outdated, because the record names its input.
- An enrollment with two voices fails with the tracker's error, and the user records again alone.
- The lease does not stop speech output. If the character speaks during the recording, echo cancellation must remove the voice, or the tracker rejects the recording. How much echo cancellation removes in a second window is not measured.
- On desktop, the settings window opens a second stream of the microphone while the host holds its own. Chromium supports this. The effect on echo cancellation and automatic gain of the host stream is not measured.
- Wake word detection continues during the recording. A detected wake word cannot start an input, but it can create an empty chat session for its character. Voice messages have the same behavior.
- Local storage has no lock across tabs. A save in one tab and a deletion in another tab can happen at the same time. The save then restores the deleted voiceprint. Desktop has one settings window, and the Voiceprint page and Delete all data both run in it. So only stage-web with two open tabs has this race.

## Verification

Unit tests cover the speech selection, the 5-second minimum, the 30-second limit, cancellation, and model failures with a fake VAD and a fake voiceprint model. They also cover lease renewal, release, and the end of a lease that nobody renews.
Browser tests record from the Chromium fake microphone with a fake VAD and a fake voiceprint model. They cover a complete enrollment, the lease during recording, cancel, unmount, outdated records, deletion, a save after a deletion, and Delete all data. Voice message tests cover the host behavior during a lease.
The manual input gate in the voice host has no test, because no test mounts `useVoiceStore`.
A real enrollment with a microphone and the CAM++ model is not covered by tests.
