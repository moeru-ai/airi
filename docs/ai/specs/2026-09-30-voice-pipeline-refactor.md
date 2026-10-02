# Refactor audio capture, voice control, and trusted plugins

## Problem Statement

AIRI users need reliable voice input, editable drafts, and immediate interruption across Web, Desktop, and Pocket.
Today, recording and transcription lifecycles span Hearing, voice composables, application pages, and playback orchestration.
A new input mode or provider can require changes across those owners.

The existing voice session abstraction still combines recording, VAD, transcription, and UI-facing state.
The voice composer work adds another recording and submission path that needs the same underlying lifecycle behavior.
Maintainers need shared ownership without rebuilding working audio algorithms.

Playback cancellation alone does not define interruption of reasoning, tools, synthesis, pending output, and agent notification.
Developers also need extension points for growing speaker windows, memory lookup, turn detection, and transcript corrections.
Those extensions must not require another set of UI state machines or caller-managed revision counters.

The current design is a proposal. Compiling declarations and caller examples do not prove runtime behavior.
This refactor must deliver working integration and remove replaced orchestration from existing callers.

## Solution

Provide a shared TypeScript audio pipeline and a conversation controller that applications use through public operations and snapshots.
Users keep existing recording and draft workflows while gaining consistent cancellation and complete turn interruption.

**Audio primitives**

| Name | Responsibility |
| --- | --- |
| AudioInput | Supply source audio, requested history, capture media, and detector windows. |
| Capture | Own one recording interval, its output, normal completion, and cancellation. |
| Playback | Schedule, play, fade, and stop owned audio. Report completion or silence. |

**Conversation objects**

| Name | Responsibility |
| --- | --- |
| VoiceController | Coordinate accepted input, responses, submission, and interruption for named turns. |
| SpeechInputAttempt | Represent admission, including pending permission and playback fade. |
| SpeechInput | Own one accepted input, its session, transcript, speaker evidence, and derived context. |
| Transcript | Preserve raw provider text, checked patches, and the corrected view. |
| VoiceResponse | Own one agent reply and the order of its speech producers. |
| SpeechStream | Own text and synthesized output from one producer within a VoiceResponse. |

**Three primary flows**

- Voice message: AudioInput → Capture → preview → explicit attachment submission.
- Conversation input: signal policy → SpeechInputAttempt → Capture → Hearing → Transcript → plugins → draft or agent submission.
- Conversation output: core agent → VoiceResponse → SpeechStreams → existing TTS chunker → synthesis → Playback.

UI controls and authorized signal policies interrupt named turns through VoiceController.
Memory, speaker identification, wake-word detection, and rewriting remain replaceable plugins or application adapters.
The runtime supplies lifecycle and publication rules. Plugin authors own their models, searches, allocations, and cleanup.

## User Stories

### Recording and permission

1. As a user, I want microphone permission handled once, so that recording controls behave consistently.
2. As a user, I want cancellation during permission startup, so that a late permission result does not start unwanted recording.
3. As a user, I want device changes to replace the source safely, so that old audio cannot enter a new recording.
4. As a user, I want recording state to appear immediately, so that I can distinguish startup from accepted capture.
5. As a user, I want device and recording errors reported clearly, so that I can recover without reloading the application.

### Input modes and voice messages

6. As a user, I want Push to Talk to record while held, so that releasing the control ends my input.
7. As a user, I want toggle recording, so that a second press ends a hands-free recording.
8. As a user, I want VAD to provide speech signals, so that application policy can decide when to accept or end input.
9. As a user, I want voice attachments available with Hearing off, so that recording a message does not require transcription.
10. As a user, I want preview, cancellation, and explicit sending, so that recording completion never sends a message unexpectedly.

### Transcription and submission

11. As a user, I want partial transcripts during speech, so that I can see recognition before recording ends.
12. As a user, I want final transcription after normal recording completion, so that my final words remain available.
13. As a user, I want file-based and streaming providers supported, so that provider capabilities do not change basic input behavior.
14. As a user, I want failed sends to retain my draft, so that retry does not require another recording.
15. As a user, I want retries to reuse submission identity, so that one voice message cannot appear twice.

### Characters and drafts

16. As a user, I want each accepted input assigned to a character session, so that changing characters cannot redirect existing work.
17. As a user, I want role wake words to select their character, so that speech reaches the intended conversation.
18. As a user, I want wake-word detection active during playback, so that I can address a character while it speaks.
19. As a user, I want separate editable drafts per character, so that switching the front draft preserves earlier drafts.
20. As a user, I want existing requests to retain their settings, so that later character changes do not alter an active response.

### Interruption and cancellation

21. As a user, I want an interrupt button to stop the selected response, so that reasoning and queued speech do not continue afterward.
22. As a user, I want Push to Talk to fade playback before capture, so that assistant audio does not enter my transcript.
23. As a user, I want accepted new speech to interrupt through VAD policy, so that voice interruption uses the same operation as UI controls.
24. As a user, I want the agent informed of external interruption, so that it can distinguish interruption from natural completion.
25. As a user, I want unrelated sessions to continue, so that interrupting one character does not stop all audio and reasoning.

### Multiple speech producers

26. As a user, I want a short acknowledgment before a longer answer, so that I receive feedback while reasoning continues.
27. As an agent developer, I want text chat to open a VoiceResponse directly, so that speech output does not require microphone input.
28. As an agent developer, I want concurrent speech producers with stable playback order, so that faster synthesis cannot reorder the reply.
29. As an agent developer, I want to cancel an outdated acknowledgment, so that the main answer can proceed without a false interruption event.
30. As an agent developer, I want existing early TTS chunks preserved, so that the refactor retains current speech-start behavior.

### Audio plugins

31. As a plugin author, I want growing and sliding audio windows, so that recognition can improve as more useful samples arrive.
32. As a plugin author, I want ordered audio blocks, so that stateful VAD and wake-word models can maintain their own state.
33. As a plugin author, I want source-tagged evidence, so that the application can associate recognition with the correct input.
34. As a plugin author, I want turn detection to read audio, transcript, and conversation context, so that silence alone does not determine completion.
35. As a plugin author, I want source changes reported, so that model state does not combine samples from different devices.

### Memory and corrections

36. As a plugin author, I want memory search during transcription, so that relevant context is ready before submission.
37. As a plugin author, I want speaker-aware retrieval, so that candidate evidence can guide searches without asserting uncertain identity.
38. As a user, I want raw and corrected transcripts retained, so that I can inspect provider output and accepted corrections.
39. As a plugin author, I want fuzzy search to supply rewrite evidence, so that a rewrite agent proposes the actual text changes.
40. As a plugin author, I want word and sentence patches, so that targeted corrections preserve unrelated text and manual edits.

### Plugin lifecycle

41. As a plugin author, I want one task context for asynchronous work and publication, so that I do not coordinate separate compute and publish callbacks.
42. As a plugin author, I want ordered and latest subscriptions, so that I can choose processing behavior for my workload.
43. As a plugin author, I want transcription and dependency completion waits, so that final memory uses the appropriate completed input.
44. As a plugin author, I want ordinary typed context values, so that Maps and application objects do not require artificial JSON conversion.
45. As a plugin author, I want scoped cancellation, errors, and disposal, so that stopping my work does not silently stop unrelated input.

### Maintainers and integration

46. As a maintainer, I want lifecycle logic outside Vue, so that all clients share recording and interruption behavior.
47. As a maintainer, I want Hearing to accept media and return transcript events, so that it does not own microphone or UI policy.
48. As a maintainer, I want no framework resource quotas, so that plugin integration does not require invented memory and task budgets.
49. As a maintainer, I want obsolete orchestration removed with migrated callers, so that two voice runtimes do not remain active.
50. As a maintainer, I want public behavior tests, so that internal refactoring does not require rewriting implementation-detail assertions.

## Implementation Decisions

### Module ownership

- Extend pipelines-audio with reusable AudioInput, Capture, observation, and Playback behavior. Its core has no Vue, Pinia, or character-routing dependency.
- Keep browser contexts, microphones, worklets, track ownership, and playback envelopes in audio adapters. Reuse existing encoding utilities.
- Implement VoiceController and conversation objects in core-agent. Preserve the existing dependency direction from core-agent to pipelines-audio.
- Narrow Hearing to provider selection, provider configuration, supported media, and transcript adaptation. Move capture and signal scheduling to their owners.
- Keep stage composables as snapshot and command adapters. Components render state and invoke operations without owning another runtime.

### Reuse and primitive pipelines

- Reuse the existing speech pipeline, Playback manager, TTS chunker, VAD adapter, and codecs where their behavior matches the contract.
- The input pipeline ends its media responsibility at a PCM stream, supported native media stream, or completed file or Blob.
- Hearing consumes that media and returns transcript events. Conversation processing belongs to the next owner.
- The output pipeline connects text chunks, synthesis, and Playback. It does not select characters, notify agents, or interpret VAD.
- Inject external adapters at application setup through existing project conventions. Do not add dependency objects for internal sibling calls.

### Source and capture lifecycle

- AudioInput can serve several captures and observers. Their lifetimes are independent, and cancellation releases only owned resources.
- Use an explicit attempt state for pending permission, fade, capture, finalization, and settlement. UI state follows that state.
- Handle late permission results, cancellation during startup, source replacement, and teardown centrally. Do not recreate generation counters in callers.
- Normal capture completion closes accepted audio and permits downstream finalization. Cancellation aborts owned work and rejects late publication.
- Capture and detector windows share source samples without creating an AudioNode for each plugin. Adapters own real transport backpressure and gap reporting.

### Streaming transcription

- Represent supported inputs explicitly: PCM stream, native media stream, or file. Report incremental versus final-only output capabilities separately.
- Consume transcription output while audio input remains open. Do not hide a collect-all-audio step behind a streaming interface.
- Separate capture completion, provider completion, plugin settlement, and submission. Normal capture finish must not abort final ASR output.
- Normalize provider revisions into raw transcript events. Completion requires accepted input completion and valid provider completion, followed by output closure.
- Propagate source, provider, and output-reader cancellation through their owned resources. Reject unsupported media and malformed completion without false success.

### Trusted plugin model

- Install plugins through VoiceController. Expose installation, input, and task scopes with cancellation, errors, disposal, and public lifecycle waits.
- Use one asynchronous task callback with checked publication operations. Remove the separate compute-result and publish-result callback pattern.
- Ordered subscriptions preserve processing order. Latest subscriptions coalesce pending updates without repeatedly aborting active work on every transcript change.
- Apply no framework byte budgets, task counts, subscription counts, recording caps, or pending-item quotas. Do not recreate these as configuration switches.
- Timeouts and SpeechStream deadlines are optional caller choices. Plugins own allocations and work that ignores abort. The runtime is not a sandbox.

### Context and dependency semantics

- Context writes accept generic in-process values. Only persistence and transport adapters impose serialization formats.
- Published values retain plugin and input ownership. A plugin replaces a value to signal changes instead of mutating a captured value silently.
- Declare transcript, speaker, neighboring-segment, correction-source, and upstream-context dependencies before dependent work starts.
- Track absent selected keys and neighbor positions. Reject stale publication without requiring caller-managed revision labels or generation counters.
- Check feedback through corrected text and context. Support raw-memory → rewrite → corrected-memory without adding a general workflow engine.

### Lifecycle waits and submission

- Provide untilTranscriptionEnded for raw provider completion and untilDependenciesSettled for relevant upstream plugin completion.
- Run lifecycle waits separately from transcript subscription callbacks, so that final processing does not occupy a latest subscription's execution slot.
- Wait outcomes distinguish completion, cancellation, and failure. A disposed or cancelled task cannot regain write access from a retained completion fact.
- Submission waits only for explicitly registered final-processing work within its caller-selected grace period. There is no framework maximum.
- Commit the chosen text, speaker evidence, and context once. Later updates require an explicit correction or another request, not silent prompt mutation.

### Transcript corrections

- Preserve raw provider history, patch records, and a corrected view. Use raw and corrected names rather than effective.
- Fuzzy search supplies evidence to a rewrite agent. Only a checked patch operation changes corrected text.
- Support token-range and segment edits with expected text. Apply a proposal atomically and protect conflicting manual edits.
- Track segment-local dependencies. Unrelated appended text does not invalidate a patch, while changed targets or selected neighbors do.
- Remove a disposed plugin's active automatic contributions while preserving history and manual edits. Committed messages remain unchanged.

### Signals, characters, and drafts

- PTT, toggle, VAD, wake-word, and end-detection policies use the same public input operations. Algorithms remain external plugins or adapters.
- Preserve accepted character-card wake-word storage, pronunciation conflict ownership, and character-session routing decisions.
- Keep wake-word detection active during playback. Application echo policy must reject assistant playback before it accepts a wake or VAD interruption.
- Preserve PTT's immediate indicator and capture after playback fade. Freeze each request's character settings while permitting other sessions to generate.
- Keep editable drafts by character when Auto send is off. Front-draft navigation must not silently change the chat window's session.

### Cancellation and external interruption

- Keep task cancellation, input cancellation, response cancellation, and external interruption distinct. Operations target explicit input or turn identities.
- External interruption immediately closes named turns to late LLM, tool, TTS, and playback output. Propagate abort to their active work.
- Playback only stops and fades audio. VoiceController coordinates reasoning, synthesis, queued output, persistence, and agent notification.
- Record a stable interruption event for the agent without adding a fake user message. Retries reuse event identity and report notification status.
- Confirm silence through the playback adapter before dependent capture starts. Failure cannot count as silence, and unrelated sessions remain active.

### VoiceResponse and SpeechStream

- A text input can open a VoiceResponse without passing through capture or transcription. Core-agent supplies acknowledgment and answer text.
- Opening a SpeechStream reserves its response order before synthesis. Provider completion order must not reorder playback.
- Preserve existing TTS chunking and early-chunk behavior. Producers receive cancellation and completion without a mandatory deadline.
- Cancelling an acknowledgment releases its output while the answer continues. It does not generate an external interruption event.
- Ending a producer flushes its text. Finishing a VoiceResponse seals new producers and drains accepted output, unless cancellation or interruption wins.

### Attachment submission and UI migration

- Keep voice messages independent of Hearing mode. A completed Capture becomes a previewable draft until the user explicitly sends it.
- Use message and session identity for submission acknowledgment. Retain a recoverable draft after failure and reuse identity on retry.
- Remove history scanning and encoded-audio comparison as evidence that a send succeeded. Message persistence supplies that result.
- Migrate Web, Desktop, and Pocket callers, including settings recording and the voice composer. Use shared snapshots for progress and errors.
- Use central Eventa contracts for cross-process control. Keep media ownership in the selected audio host and transport PCM through its dedicated channel.

### Migration order and completion

- First implement source and capture ownership, then migrate recording and attachment callers. Remove replaced startup and recorder coordination in that slice.
- Next convert Hearing adapters and migrate speech-session callers. Retain existing provider protocols and correct padded VAD audio behavior.
- Then connect VoiceResponse, SpeechStream, UI interruption, VAD interruption, persistence, and agent notification through VoiceController.
- Add extension integration scenarios for speaker windows, memory, rewriting, and turn detection using supplied external adapters.
- Each slice removes the orchestration it replaces. Completion requires migrated callers, working public imports, documentation, and passing behavior checks.

## Testing Decisions

### Primary public entry point

- Use VoiceController's public operations and observations as the main acceptance entry point for the integrated conversation flow.
- Run real audio and conversation modules together. Replace only external source, provider, model, playback-device, persistence, and notification adapters.
- Assert observable transcripts, media, submission results, playback order, interruption receipts, notifications, and resource release.
- Do not assert private helper calls, internal class layouts, queue representations, revision counter values, or arbitrary resource budgets.
- Retain focused tests for independently public AudioInput and Playback behavior that the conversation entry point cannot faithfully expose.

The user confirmed this test boundary: public conversation flows first, with browser checks for platform behavior.

### Existing test patterns to reuse

- Speech-pipeline tests already cover out-of-order TTS completion, cancellation during synthesis, and rejection of queued output after cancellation.
- Playback-manager tests already cover stopping active and queued output. Reuse their public scheduling and completion assertions.
- Voice-session and transcription-chain regressions cover padded VAD audio, startup cancellation, new work after reset, and stale provider results.
- Hearing status browser tests show real Vue and Pinia integration with external provider substitutes. Reuse observable UI states.
- The core-agent audio provider probe is optional credentialed integration evidence. It does not establish capture, VAD, or interruption correctness.

### Input and streaming acceptance

| Scenario | Observable result |
| --- | --- |
| Permission resolves after cancellation | No accepted capture starts. Late acquired resources release. |
| Device changes during recording | Old callbacks cannot publish into the replacement input. |
| PTT release occurs during fade | The attempt settles without accepting unwanted audio. |
| One capture ends while another observer runs | The observer and physical source remain active. |
| PCM arrives while transcription emits partial text | Partial output appears before input EOF. |
| Capture finishes normally | Final provider text remains available before successful completion. |
| File or final-only provider runs | The same lifecycle reports its actual capabilities and result. |
| Provider fails or sends malformed completion | The input fails without committing an apparently complete transcript. |
| Output reader cancels | Owned provider and input-reader work stop, and pending reads settle. |
| Voice attachment sends twice after a retry | One persisted message identity exists, and failures retain the draft. |

### Plugin and correction acceptance

| Scenario | Observable result |
| --- | --- |
| More audio arrives during speaker inference | The next selected window reflects new samples and source identity. |
| A slow latest lookup finishes after new text | Stale publication is rejected and current pending work can proceed. |
| Ordered input updates arrive | Callbacks observe their selected order without silent quota-based dropping. |
| A task waits for transcription completion | Live transcript subscriptions continue. |
| Final memory depends on rewrite | The dependency wait returns the appropriate corrected view. |
| Fuzzy search and rewrite complete | Raw text remains available and only checked edits affect corrected text. |
| An unrelated sentence appends | A patch with unchanged selected dependencies remains valid. |
| Selected neighbors or manual spans change | Stale or conflicting patches do not overwrite current text. |
| Plugin disposal occurs during external work | Late writes fail, registered cleanup runs, and unrelated work continues. |
| Context contains Maps, Dates, or application objects | Values work in process without JSON conversion or size accounting. |
| A caller omits timeout and deadline settings | Normal task and stream completion still work. |
| An explicit timeout expires | The declared failure or cancellation outcome appears and late writes fail. |

### Output and interruption acceptance

| Scenario | Observable result |
| --- | --- |
| An acknowledgment and answer synthesize concurrently | Playback follows reserved producer order. |
| A delayed acknowledgment is cancelled | The answer proceeds and no user-interruption event appears. |
| Text chat produces speech | VoiceResponse creation needs no microphone or transcription setup. |
| UI, PTT, or accepted VAD interrupts a turn | Generation, synthesis, queued output, and active playback stop for that turn. |
| A provider ignores abort | Late tokens and audio cannot reopen the closed turn. |
| Another character session is generating | Its work continues unless explicitly targeted. |
| Interruption notification retries | Stable event identity prevents duplicate agent interpretation. |
| The playback host fails during fade | Capture receives failure rather than a false silence receipt. |
| Character selection changes during a request | The active request keeps its original session and settings. |
| Auto send is off across multiple characters | Draft navigation preserves all unsent drafts and their session ownership. |

### Platform checks and implementation gates

- Use Vitest browser mode for permission, Web Audio, MediaStream, component interaction, and actual browser resource lifecycles.
- Keep Vue and Pinia real in UI tests. Mock Electron IPC and external services at their supported boundaries.
- Use deterministic deferred provider results for ordering and cancellation scenarios. Use fake clocks only at a supported clock boundary.
- Run each changed workspace's typecheck and related tests. Run root typecheck for shared package or exported contract changes, followed by lint.
- Record Web, Desktop, and Pocket integration results. Report unavailable hardware or providers explicitly rather than treating them as successful checks.

## Out of Scope

- Selecting or training new VAD, wake-word, speaker, turn-detection, memory, or rewrite models. Existing and concurrent adapters remain external dependencies.
- Building a new memory database, fuzzy-search service, speaker enrollment product, or complete wake-word settings product.
- A plugin sandbox, marketplace, package discovery service, general dependency-graph engine, or resource quota system.
- Replacing working codecs, ASR protocols, TTS providers, or chunking algorithms without a migration requirement.
- Unrelated visual redesign, backend billing changes, or unrelated agent configuration changes.

## Further Notes

- This specification follows the latest reviewed design direction, including revision 5's removal of resource quotas and mandatory deadlines.
- Earlier sub-agent reviews tested interface comprehension and found lifecycle counterexamples. They did not prove runtime performance or implementation correctness.
- Use VoiceController and SpeechInput vocabulary. Earlier Voice Harness and utterance names do not define new implementation concepts.
- Preserve the accepted decisions titled “Store wake words with character cards” and “Route voice turns by character session.”
- Preserve stale-binding and single-owner behavior from “Voice input binding follows the microphone stream” while replacing its current orchestration layout.

The initiating work is [PR #2546: voice messages and mobile dictation](https://github.com/moeru-ai/airi/pull/2546).
At specification time, that PR remains open and some composer work is absent from the local main checkout.
Implementation must reconcile the current PR and base branch before migrating those callers. This spec does not request a blind merge or production rollout.

Existing accepted pronunciation ownership and character-card persistence remain authoritative.
No new persistent schema is required for in-process plugin context. Submission and interruption persistence must preserve stable identities and existing history.

This is one refactor specification with ordered implementation slices. The ready-for-agent label indicates implementation scope, not completed validation.
