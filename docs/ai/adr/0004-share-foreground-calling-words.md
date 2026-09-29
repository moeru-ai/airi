# Share foreground calling words

## Context

Web, Electron, and Pocket need the same calling-word capture and delivery policy.
Each host retains its own lifecycle, permission UI, and recording presentation.

## Decision

`useHearingCallingWords` owns model loading, vocabulary projection, and the keyword listener.
`useStageHearing` owns one wake window, speech capture, cooldown, and immutable segment ownership.
`useHearingDelivery` sends completed text to its captured session or preserves it in `hearing-drafts`.

Capture fixes the session ID, character ID, segment ID, and lifecycle generation before the first asynchronous gate.
Streaming callbacks carry that same segment through provider startup and delayed results.
A selection change cannot route an earlier utterance to another character.
Mode changes, microphone replacement, manual recording, and host suspension invalidate unfinished capture.
Completed buffered text becomes a draft if its automatic-send eligibility changes.

Electron supplies its existing manual-recording lease as a suspension signal.
Recording and transcription callbacks carry segment IDs so floating windows can ignore completion from earlier capture.
The foreground runtime can interrupt speech output after a calling-word match.
It selects the matching character and session before capturing the next utterance.

An empty vocabulary starts one character-owned setup reply per mode activation.
The setup instruction exists only in the provider request.
It does not create a user message or count as a user send in analytics.

## Consequences

Native background recognition stays outside this module.
Its notification adapter can call `armWake` after foreground preparation.
Settings use `hearing-runtime` for preparation feedback without persisting runtime state.
Each mounted host claims runtime ownership and registers a unique consumer ID.
Cleanup from an older instance cannot remove its replacement or overwrite its preparation state.
The module does not own microphone tracks. The host and device store release them.
