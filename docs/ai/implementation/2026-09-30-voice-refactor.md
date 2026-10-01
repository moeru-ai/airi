# Voice refactor implementation record

Spec: [issue #2738](https://github.com/moeru-ai/airi/issues/2738) and [the local specification](../specs/2026-09-30-voice-pipeline-refactor.md).
The user confirmed public VoiceController flows, external adapter substitutes, and browser platform checks.
Independent AudioInput and Playback checks remain part of that scope.

## Status

This branch contains the implementation and application migration. Final acceptance remains incomplete.
The verification below records the implementation run, when browser checks and Git writes were restricted.
The push retry uses an isolated worktree to preserve unrelated local changes.

- [x] Add AudioInput, Capture, observer windows, Playback, and public behavior tests.
- [x] Add SpeechInputAttempt, raw and corrected transcripts, and trusted plugin scopes.
- [x] Add VoiceResponse, ordered SpeechStream producers, and interruption receipts.
- [x] Add browser audio adapters, PCM encoding, and a media-only Hearing adapter.
- [x] Add concurrent chat session queues, stable submission receipts, and named generation cancellation.
- [x] Adapt the existing WebSocket TTS protocol to SpeechStream.
- [x] Connect Web, Desktop, Pocket, settings, cross-window controls, and character drafts.
- [x] Add voice attachment recording, preview, discard, explicit send, and retry.
- [x] Remove replaced voice-session, recorder, Hearing session, and TTS-session orchestration.
- [x] Run Spec and Standards reviews and fix their implementation findings.
- [ ] Run browser acceptance checks on a host that permits local listening and browser launch.
- [ ] Obtain a passing full test suite and root lint result.
- [x] Prepare task changes on `nekomeowww/feat/voice-pipeline-refactor`.

## Ownership

- `pipelines-audio` owns audio sources, independent captures, observation windows, recording admission, and playback groups.
- `audio` owns browser contexts, physical microphone leases, media encoding, playback nodes, and fade completion.
- `core-agent` owns input admission, transcripts, plugins, responses, ordered speech producers, and named interruption.
- Hearing accepts supported media and returns transcript events. It owns no microphone or conversation policy.
- Stage stores bind application persistence, provider settings, character routing, and Eventa commands to those boundaries.
- Components render snapshots and send commands. The selected audio host owns live media.

## Behavior

- Capture streams audio into ASR while the application consumes transcript updates.
- Normal capture completion permits final provider output. Cancellation closes the owned provider and readers.
- Each microphone consumer holds a lease. The final release also closes tracks returned after late permission approval.
- Source replacement cancels old controller observations without closing a borrowed source or unrelated consumers.
- Detector windows retain requested pre-roll during inference. The framework imposes no buffer quota or mandatory inference deadline.
- Transcript patches preserve raw text and record corrections. An unchanged sentence retains its correction when another sentence arrives.
- Plugin tasks provide checked context writes, patches, cancellation, errors, and completion waits.
- External interruption closes a named turn, cancels generation and speech, waits for playback silence, and stores a deduplicated control event.
- Unrelated sessions continue. Ordinary cancellation produces no external interruption event.
- Voice attachments work without Hearing. Explicit submission retains the original session and message identity across retries.
- Model input capabilities select native audio or cached ASR text. Text-only compatibility requests also receive the ASR projection.
- Wake-word and VAD policies remain external adapters. Character-card pronunciations, conflicts, echo acceptance, and background routing have explicit owners.
- Memory, speaker identification, rewriting, and turn detection use extension APIs. This change does not select their models or search services.

## Verification

Commands below used installed workspace binaries because pnpm dependency checks could not reach the registry.
Paths in the command column are relative to the stated working directory.

| Working directory | Command | Result |
| --- | --- | --- |
| Each changed workspace | `../../node_modules/.bin/tsc --noEmit` or `../../node_modules/.bin/vue-tsc --noEmit` | All 11 workspaces passed. |
| `packages/core-agent` | `../../node_modules/.bin/vitest run src/runtime/llm-service.test.ts src/runtime/chat-orchestrator-runtime.test.ts src/voice` | 86 passed. |
| `packages/stage-ui` | `../../node_modules/.bin/vitest run --project=node src/stores/chat.contract.test.ts src/stores/character.test.ts src/services/airi-card-import-export.test.ts src/libs/audio/hearing-transcriber.test.ts src/libs/voice src/services/speech/speech-client.test.ts` | 57 passed. |
| `packages/provider-inference` | `../../node_modules/.bin/vitest run src/model-catalog.test.ts --project=node` | 4 passed. |
| `packages/audio` | `../../node_modules/.bin/vitest run --project=node` | 7 passed. |
| `packages/pipelines-audio` | `../../node_modules/.bin/vitest run` | 64 passed, 3 failed in the unchanged PlaybackManager tests. |
| Repository root | `node_modules/.bin/vitest run` | 2241 passed, 93 failed, 4 skipped, 16 unhandled errors. |
| `packages/stage-ui` | `../../node_modules/.bin/vitest run --project=node` | 746 passed, 38 failed, 9 unhandled errors. See the failure notes below. |
| Repository root | `pnpm typecheck` | Dependency policy verification failed to reach npm registry. Stopped retries after ENOTFOUND. |
| Repository root | `pnpm lint` | Dependency policy verification failed to reach npm registry. Stopped retries after ENOTFOUND. |
| Repository root | `node_modules/.bin/moeru-lint .` | Failed with 641 ESLint errors across the worktree. |
| Repository root | `node_modules/.bin/eslint` with the task source list | Remaining failures concern existing long comments in changed files. New runtime and migrated lifecycle test checks passed. |
| Repository root | `git diff --check` | Passed. |

Builds passed for audio, pipelines-audio, provider-inference, and core-agent with their installed `tsdown` binary.

The final typecheck covers audio, pipelines-audio, provider-inference, core-agent, stage-ui, stage-layouts, stage-pages, i18n, stage-web, stage-pocket, and stage-tamagotchi.
All eleven final workspace commands exited successfully. Root typecheck remains blocked by dependency policy verification.

### Failure notes

- Browser tests cannot start because local listening fails with `EPERM`. WebSocket integration tests have the same environment restriction.
- Root failures include local server startup, browser launch, unavailable Node localStorage, and external network requests.
- Stage failures include existing localStorage assumptions and incomplete localforage substitutes.
- The full Stage run overlapped the final Hearing cleanup regression. That test now passes in the final targeted run.
- Five session tests failed because old internal mocks lacked the named-character prompt API.
- All 20 session lifecycle tests now use real Pinia, Auth, and AiriCard stores in browser mode.
- Synchronized session tests also use real stores. Only storage and network adapters are replaced.
- Those browser migrations typecheck but remain unexecuted. They are not reported as passing.
- New component checks cover attachment identity across session navigation and keyboard Push to Talk. Browser execution remains pending.

## Standards

The final review identified incomplete ASR cleanup and a nested reactive configuration snapshot.
Both findings are fixed.

- ASR failure now aborts all local provider tasks. A standalone regression failed before the fix and passes afterward.
- Artistry snapshots use deep copying. Background writeback reads the current card before changing its owned field.
- Session test migration removes internal store substitutes and retains real reconciliation and message merging.
- Cloud hydration tests target the failing chat identity, including additional pulls produced by real reconciliation.

No outstanding implementation finding remained in the final targeted Standards review.
Browser verification and existing repository lint failures remain separate acceptance limits.

## Spec

The final review identified an old observation that survived borrowed audio replacement.
The controller now cancels only its own observations, including pending source acquisition.
A public regression failed before the fix and passes afterward. Independent consumers keep receiving audio.

Earlier findings also have fixes and targeted coverage for delayed pre-roll, failed remote admission, transcript patches, and provider failure.
No outstanding implementation finding remained in the final targeted Spec review.

## Follow-up checks

- Run permission, shared microphone, device replacement, playback fade, and native Web Speech browser tests.
- Run synchronized session, remote stream, settings preview, and voice control browser tests.
- Check Web, Desktop, and Pocket with real providers, captions, and lip synchronization.
- Reconcile the unchanged PlaybackManager failures and repository-wide lint failures with the branch baseline.
- Repeat root checks when registry access and local servers are available.
- Complete browser and root validation before merging this branch.

## Workspace preservation

The implementation started on `main` at `752c7527b7c99f61e403d7f8d4ddb11b0f1155a0`.
The push retry prepares `nekomeowww/feat/voice-pipeline-refactor` in a separate worktree from that tested base.
The branch was then rebased onto `origin/main` at `96ca8bbe7a029fe0474f364584957cf7a372abe1`.

Original index and worktree patches are saved in private temporary files with the `airi-voice` prefix.
The task delta excludes unrelated startup screens, IndexTTS changes, and agent configuration.
Original staged changes remain intact in the main worktree.

Git object writes were blocked during implementation. Permissions were restored for the push retry.


## Main rebase verification

The rebase retains provider refresh between tool steps and the xsAI 0.5.1 update.
The text projection callback receives the current conversation, including completed tool calls and results.
This prevents a provider switch from projecting an earlier conversation and losing completed tools.
The added regression failed before the integration fix and passed afterward.

All commands ran in the isolated feature worktree.

| Working directory | Command | Result |
| --- | --- | --- |
| Repository root | `pnpm install --frozen-lockfile` | Passed, including package builds. |
| Repository root | `pnpm --dir packages/core-agent typecheck` | Passed. |
| Repository root | `pnpm --dir packages/core-agent build` | Passed. |
| Repository root | `pnpm typecheck` | All 53 tasks passed. |
| Repository root | `pnpm lint` | Passed with 0 errors and 625 warnings. |
| `packages/core-agent` | `../../node_modules/.bin/vitest run` | 197 passed. |
| `packages/stage-ui` | `../../node_modules/.bin/vitest run --project=node src/stores/chat.contract.test.ts src/stores/character.test.ts src/services/airi-card-import-export.test.ts src/libs/audio/hearing-transcriber.test.ts src/libs/voice src/services/speech/speech-client.test.ts` | 57 passed. |
| `packages/audio` | `../../node_modules/.bin/vitest run --project=node` | 7 passed. |
| `packages/provider-inference` | `../../node_modules/.bin/vitest run src/model-catalog.test.ts --project=node` | 4 passed. |
| `packages/pipelines-audio` | `../../node_modules/.bin/vitest run src/audio-input.test.ts src/playback.test.ts src/recording.test.ts` | 15 passed. |
| Repository root | `node_modules/.bin/eslint packages/core-agent/src/runtime/llm-service.ts packages/core-agent/src/runtime/llm-service.test.ts packages/core-agent/src/types/llm.ts packages/stage-ui/src/stores/chat.ts` | Passed with 2 comment warnings. |
| Repository root | `git diff --check` | Passed. |

The rebase validation resolves the earlier root typecheck and lint blockers.
Browser acceptance and the other follow-up checks above remain pending.
The original workspace status matches the push baseline. Its staged patch remains unchanged.
