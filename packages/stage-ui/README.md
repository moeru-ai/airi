# Stage UI

Shared core for stage

## Experimental features

Register flags in `libs/feature-flags.ts`. Read their state through `useFeatureFlagsStore().isEnabled(key)`.
Set `availability` to `local` or `cloud`. Local flags expose device switches without Cloud access.
Cloud decides whether each granted Cloud flag allows account opt-in or uses direct control. Client registrations do not duplicate this mode.
`cloud-opt-in` flags expose switches only after Cloud grants access to a verified account. They start disabled and retain choices per account on this device.
`cloud-controlled` flags follow Cloud grants directly and never expose a switch.
Missing Cloud grants disable Cloud features. Refresh failures and account changes clear grants, not local choices.
`useCloudFetch()` in `composables/cloud.ts` shares the Cloud origin and authenticated fetch boundary. The store reads `GET /v1/feature-flags`.
Set `VITE_CLOUD_URL` for a custom Cloud origin. Deploy its migration and API before the client.
Keep authorization checks on the server.

## Notifications

Notifications are private messages from AIRI Cloud to the signed-in account. Code and API names use `inbox`.
`useInboxStore()` in `stores/inbox.ts` owns the unread count, the loaded pages, and the read actions for one window.
The store reads the count at sign-in, on window focus, and every 5 minutes. A list loads only when a panel opens.
Opening a message marks it read. The count changes at once and rolls back if Cloud rejects the write.
Sign-out and account changes clear all state. Responses from the old session are dropped.
Requests use the generated `@proj-airi/cloud-client` functions with `authedFetch`, so a 401 refreshes the token once.
The store keeps only kinds that `inbox-presentation.ts` can render. It skips unknown kinds and invalid params.
Entry points: the web account menu opens `InboxPopover` anchored to the account pill.
The mobile menu opens `InboxDrawer` as a sub-panel with a back button. The Electron island shows `InboxPanel` in place.
Entry points show nothing while the user is signed out. Announcements are a separate public surface.

## Message times

Chat history shows a centered timestamp before the first dated message and after five minutes without a message.
Timestamps use stored message times, the interface locale, and the device timezone. Messages without valid timestamps have no separator.
Today's separators show only the time. Yesterday and the day before use relative labels.
Older separators show the month and day. Dates outside the current year also show the year.
Click a separator to toggle its full date and time. Relative labels refresh every minute while the history is open.
`date-fns` handles calendar comparisons and localized formatting through `intlFormat` and `intlFormatDistance`.
The session list displays and sorts by the latest valid user or assistant message timestamp.
Sessions without dated conversation messages use their creation time. Loading messages updates the list from the stored history.
Saving or synchronizing a session does not change its displayed activity time unless its messages change.

## Startup progress

`useStartupResourcesStore` records each resource as queued, loading, ready, failed, or skipped.
The apps register the complete resource list before work starts. Their startup flows report each module's result through the store.
The app roots reset the store before registration. This also stops an old load from updating a new registration after hot reload.
`StartupOverlay` reads the store and shows splash, progress, or an error with a retry action.
`useStartupResourceTimeout` fails a resource that stays loading past its deadline. Web and Pocket apply it to character model loading.
The optional Mods server connects outside the tracked startup work. Its connection does not block onboarding.
Each app's HTML shows the first splash before Vue mounts. CSS hides it when Vue renders into `#app`.
The home page reports when its character model is ready or fails. A failed model keeps the overlay visible.
If the model fails, the user can retry the app or continue without a character.
The overlay emits `finished` when all resources are ready. Apps open onboarding at that point.

## Voice integration

The audio host owns one VoiceController and one shared microphone input.
Other windows send Eventa commands and render snapshots. They do not create competing capture or playback runtimes.
Consumers subscribe to the microphone input with their own abort signal. The last subscriber to leave releases the device.

- `useVoiceStore` owns application routing, drafts, responses, and host command registration.
- `useVoiceController` binds public controller state to Vue and moves the controller to the input of the selected device.
- `useVoiceInput` maps hold and release controls to host commands.
- `VoiceInputButton` is the voice control of desktop and web composers. Click it to start, and click again to stop. Hover or right-click it for the mode, Auto send, the microphone, and continuous listening. Its status bar shows the waveform and time, and keeps a voice message that waits to be sent. Dictation writes its live transcript into the composer text and creates no voice draft.
- `VoiceComposer` is the touch voice control of mobile composers. Hold it to record, slide left to cancel, and slide up to lock. A voice message is sent on release.
- `useVoiceMessagesStore` owns voice message recordings and their attachment submission.
- Hearing selects providers and converts captured PCM to each provider's upload format. It does not open the microphone.
- Speech preserves existing chunked synthesis and bidirectional provider output.
- `createVoiceRephrasePlugin` rewrites final transcripts with a chat model through a checked transcript patch. The raw text stays in the transcript history. Each segment gets its own rewrite, so segment boundaries stay for later speaker labels. A reply with another segment count leaves the text unchanged.
- `createVoiceEndJudgePlugin` ends a paused input early when a chat model reads its transcript as a finished message. The model is the rephrase model, or the chat model when no rephrase provider is set.
- `createSpeakerEvidencePlugin` compares each automatic input with the owner's voiceprint while Speaker recognition is on. It writes the mean cosine of the speech as speaker evidence, and the IO trace of the input records it. It never changes an input, and the chat prompt does not include it.

A pause of 1.2 seconds can end an input. With the end judge on, which is the default, the voice activity silence limit grows by 3 seconds.
The judge then ends a finished message at the pause, and an unfinished one waits for the speaker to continue.
A failed or slow judgement never blocks new speech. Without the end judge, the 1.2-second pause ends every input.

The host snapshot carries the corrected transcript segments of the active input. `VoiceDrafts` shows them as the continuation of the draft, in one paragraph. The paragraph is read-only while speech is transcribed, and becomes the editable draft when the speech settles. Final text uses the body color. Pending text uses the theme color at a lower opacity, and the newest pending segment uses full opacity.
A draft that the host is sending stays hidden. Drafts of other conversations show as named chips. `VoiceDrafts` emits `presence`, so a host can react when it shows nothing, for example after a send or a discard.
Rephrasing is on by default. A failure or a 10-second timeout submits the provider text.

A recording is sent only when its control asks for it with `finish` and `send: true`, or with an explicit `send`. A failed send keeps the recording and its message identity, so the control can send it again or discard it.
While a control records or dictates, the host publishes the microphone level on `voiceInputLevel`.
Native audio requires declared model support and Chat Completions. Other models transcribe the recording with the configured Hearing provider.
Each model request makes this decision again. A tool step that changes the model also changes the audio projection.
Local history keeps the audio and cached transcription. Audio turns remain local because cloud text records cannot preserve their media.

### Hearing input mode

The Hearing store keeps `inputMode`. The microphone switch (`useSettingsAudioDevice().enabled`) turns the selected mode on or off.

- `always-on` keeps the microphone open and runs voice activity detection. This is the default.
- `push-to-talk` starts a speech input only while the user holds a key. The microphone opens only during the hold.
- `wake-word` keeps the microphone open and runs voice activity detection and wake word detection. Only a wake starts an input.

`startsInputOnSpeech(mode)` decides if VAD alone starts an input. In `wake-word` mode, the voice store's speech target is undefined.
`SileroVad` (`workers/vad/silero-vad`) runs the VAD model in a Worker of its own, so the inference of each 32 ms window does not block the Stage render on the main thread.
Wake word detection runs in every mode that listens continuously. In `always-on` mode, a wake also moves the input to the matched character's session.
The voice host publishes the detector preparation in its snapshot as `wakeWords`, so a settings window can show it.

Each stage page calls `useVoiceListening` once. It is the one place that starts or stops continuous listening.
`listensContinuously(mode)` in `stores/modules/hearing.ts` decides which modes run detection and keep the microphone open.
To add a mode, extend `HearingInputMode`, `listensContinuously`, `startsInputOnSpeech`, and `useVoiceListening`.

`useVoicePushToTalk` connects a hold to `voice.beginManual`. The press captures the active session, so a session switch during the hold does not move the speech.
`useVoiceHold` owns the hold lifecycle: it ignores key repeats, cancels a tap shorter than 300 ms, and cancels on disable or disposal.
`useVoiceHoldKey` drives a hold with an in-page key, Space by default. It ignores text fields, controls, and modified keys, and cancels when the page loses focus.
The web stage uses Space. The desktop stage uses a configurable global shortcut.

Each host app declares whether it has a Push to Talk trigger. It provides `pushToTalkTriggerKey` from `composables/push-to-talk-trigger` at the app level.
Without a provider, the host has no trigger. The input mode selector of `HearingConfig` then disables the Push to Talk option.
If the saved mode is already `push-to-talk` on such a host, listening stays off. `HearingConfig` and the voice button menu show a warning.
`HearingConfig` is used on the Hearing overview page and in the Hearing dialogs. It asks for microphone permission only when the user turns the microphone switch on.
The mode does not fall back to `always-on`, because that opens the microphone all the time.

| Host | Trigger |
| --- | --- |
| stage-tamagotchi | Yes. All windows share one app, so the settings window offers the mode too. |
| stage-web | Only with a fine pointer, `(any-pointer: fine)`. Space is the only trigger, and no Web API reports a hardware keyboard. |
| stage-pocket, stage-tamagotchi-kirie | No. They provide nothing. |

### Wake words

`useWakeWordsStore` validates pronunciations against a supplied model vocabulary and preserves them in exported character cards.
Its device-local catalog pauses unresolved pronunciation conflicts. `chooseOwner` activates the selected character's copy.
`setWords` returns conflicts for tools or settings to present. It does not invent a model or a keyword-management UI.

The `configure_wake_words` tool edits the wake words of the character that owns the turn's session.
It validates tokens against the pinned KWS vocabulary in `libs/voice/kws-model`. It returns `saved` with conflicts, or `rejected` with a reason.

`voice.startListening` runs the built-in KWS detection when the host passes no `detectWakeWord`.
`WakeWordDetector` listens to `useSettingsAudioDevice().unprocessedInput`, a second capture of the selected microphone without browser echo cancellation, noise suppression, or gain.
That processing changes the phones that the keyword model hears. The second capture opens only while the catalog has an active pronunciation.
The detector queues 100 ms batches of finite mono samples for a Sherpaw keyword spotter Worker. Sherpa-ONNX resamples them to the model rate.
Recognition does not wait for the Worker. The voice activity plugin collects a wake on its next window. A backlog over 1 second is dropped.
The plugin also passes its VAD result to the detector. A pause of 0.5 seconds starts a new spotter stream, because a stream that runs for minutes misses most calls.
Each keyword uses the search settings of `kwsSearch` and adds tone variants from `kwsToneVariants`. A variant changes the tone of one pinyin final, because a called name often changes its tone.
A match maps through the active catalog to `voice.resolveWakeTarget(characterId, signal)`. This selects a session without navigating the chat window.
Catalog changes rebuild the spotter keywords. A result after a stop or a keyword rebuild is discarded.

`useWakeWordDetectionStore().preparation` reports `unconfigured`, `preparing`, `ready`, or `error` for UI.
The model loads only when the catalog has a pronunciation for the pinned model. Until the model is ready, detection returns no wake.
While no listener runs, the preparation is `unconfigured`.

`useSpeakerTrackerStore` owns the voice host's Sherpaw speaker tracker Worker. `acquire` downloads the pinned CAM++ pack and starts the Worker on first use.
The tracker enrolls the saved voiceprint as speaker 0, and follows each change of it. `release` terminates the Worker.
`preparation` reports `idle`, `preparing`, `ready`, or `error` for UI. No feature acquires the tracker yet.

`useVoiceprintStore` keeps the voiceprint of the device owner in local storage. Only one person can enroll.
`useVoiceEnrollment` records one enrollment from the speech input of the calling window, keeps only the speech that Silero VAD finds, and saves the voiceprint.
The enrollment belongs to the calling component, so it ends when the component unmounts.
While it records, it holds a capture lease (`holdCaptureLease`). The voice host follows leases with `useVoiceCaptureLeaseStore`.
While a lease holds, the host begins no input and records no voice message. A new lease cancels the active input and keeps a voice message that records as a draft.
A lease that nobody renews ends after 3 seconds.

A host can pass its own `detectWakeWord` to `voice.startListening`. Then the built-in detection does not start.
The detector remains active during playback. A supplied `acceptSpeech` classifier can reject playback echo before admission.
The default policy allows barge-in when the browser reports echo cancellation. Without that support, automatic admission waits for playback to end.
Model selection, acoustic echo classification, and enrollment remain external integrations.

## Chat sampling

In **Settings → Modules → Consciousness**, custom temperature and Top P are off
by default. Enable each parameter only when the selected model supports it.
Some models accept only one sampling parameter at a time.

Disabling a parameter keeps its slider value but omits it from chat requests.
Previously saved values remain disabled until the user enables them. Explicit
per-request overrides still take precedence over these settings.

## Chat images

Web and Electron composers share image drafts and previews. They accept PNG,
JPEG, WebP, and GIF files up to 20 MB each, through file selection or paste.
Previews own their Object URLs. Session changes discard pending image reads.
Failed sends restore the draft through the shared composer.

Choose a provider and model in **Settings → Modules → Vision** and enable
**Use the vision model for chat images**. The vision model describes images before
the selected chat model replies. This flow runs when the chat provider does not
report image input for the selected model. Most providers do not report it.
Local history keeps the images. Provider prompts replace images with descriptions,
including images from earlier turns and retries. Cloud history currently stores only message text.
A failed read of an image in the current turn fails the send. The leader keeps a
failed read of an earlier image in memory for its session and vision selection,
so later turns do not read that image again.

**Use the vision model for tool images** applies the same flow to images that tools
return, such as `computer_use_read_image` screenshots and MCP image content. The
vision model reads each image when the tool runs, and a tool rerun reads it too.
While the vision model reads tool images, provider prompts replace stored tool
images with a short note. Stored history keeps the images.

Disable these options to send images directly to a chat model that supports them.
Without a configured vision model, images also go directly to the chat model.
Use this flow for chat attachments and tool images, not periodic screen capture.

## Character-card module settings

The card store owns three distinct states:

- `moduleDefaults` stores global provider, model, voice, and display selections.
- Each card stores explicit overrides. An empty string means inherit.
- Module stores expose the resolved runtime selections used by the application.

Use `configureForAuthentication` for login and logout. It updates global
defaults, then reapplies the active card without saving defaults into that card.
Use card commands for activation and explicit edits. Settings pages must not
save cards from watchers: authentication and remote snapshots also trigger them.
The synchronization leader owns these commands; followers receive snapshots.

Models inherit only within the same provider. Voices also require the same
model. Selecting a vision provider on the vision page stores the catalog default
model of that provider on the active card. A different provider without a model stays unconfigured rather than
receiving an unrelated model id. The editor requires a model for an explicit
chat or vision provider unless that model can be inherited safely.

Defaults are seeded once from the current runtime on upgrade. This cannot
recover historical global values that an older card already overwrote.
Existing `speech-noop` selections are preserved because they may represent
intentional silence. Users can explicitly choose **Inherit global settings**
in the editor; importing or saving an unrelated card field does not change it.

## Character sessions

Each chat session belongs to one character. A send reads the provider, model, and system prompt of that character, not the selected card.
Selecting another card while a turn waits in the queue does not change the turn.
Before each model request, the turn reads its character's settings again. A tool that edits the character changes the next request.
Each request rebuilds the analytics correlation headers for its provider.
Tool and content-array compatibility failures belong to the model of the failing request, not the first model of the turn.
Session resets and autonomous artistry hooks also use the session character.
Each concurrent turn owns its IO trace. `activeTurnSpan` points to the most recently started turn that is still running.

A tracer view reads spans from the source that `setIOTraceSource` sets. Without a source, as in stage-web, it reads
the spans of its own window and the spans that other windows broadcast.

Tamagotchi sets the IO trace hub of the main process as the source. Each window sends its ended spans to the hub.
The hub sends them to the disk recording and to open tracer views. When **Keep recent IO traces in memory** is on, the
hub also keeps the spans of the last 30 minutes, up to 5000. A tracer view that opens later shows them.

A spoken turn is one IO trace, from the wake word to playback:

- `Wake word` (KWS) is the root when a wake started the input. It covers the match and the session selection.
- `Voice input` is the root otherwise. It records the trigger (`control`, `speech`, or `wake-word`) and the outcome.
  `activeVoiceInputSpan` points to it while the input runs.
- Its children are `Voice activity detection` (one span for each speech segment), `Speech recognition`,
  `End of speech judgement`, and `Transcript rephrase`.
- The `Interaction turn` of the submission is also its child. The input ID is the turn ID, and `takeVoiceTurnParent`
  connects them. The turn holds the LLM, streaming control, TTS, and playback spans.
- A composer dictation returns its text to the composer, which sends it later under a new ID. The next turn of the
  same session within 60 seconds continues the dictation trace through `takeComposerVoiceParent`. This link is by
  session, so a typed turn that replaces discarded dictated text in that time also joins the dictation trace.

A typed turn starts its trace at `Interaction turn`.

## Button analytics

Register the shared plugin once in each Vue application:

```ts
import { trackButtonPlugin } from '@proj-airi/stage-ui/directives/track-button'

createApp(App)
  .use(trackButtonPlugin)
  .mount('#app')
```

Buttons that represent a product-analysis click intent can then declare a
typed event without wrapping their business handler:

```vue
<Button
  v-track-button="{ name: 'update_check_clicked', channel: selectedChannel }"
  @click="checkForUpdates()"
/>
```

Keep async outcomes, confirmed state changes, impressions, and lifecycle events
in their owning business flows instead of attaching them to the initial click.

## Histoire (UI storyboard)

https://histoire.dev/

```shell
pnpm -F @proj-airi/stage-ui run story:dev
```

The **Misc → Swipe Actions** story renders one row with two start actions and three end actions. Its **Show labels** control switches between
text labels and surfaces that fill the available height. Use this story to
compare gesture presentation, not conversation storage behavior.

### Project structure

1. If a story is bound to a specific component, it can be placed beside the component in the `src` folder. e.g., `MyComponent.story.vue`
2. If a story is not bound to a specific component, then it should be placed in the `stories` folder. e.g., `MyStory.story.vue`

## Local Hearing with Sherpaw

Select **Sherpaw** in Hearing settings. Choose a language to see models that support it, then choose a model.
For a new Sherpaw configuration, the interface language sets the filter and selects a compatible model.
Chinese and English start with X-ASR on desktop and Paraformer on mobile Web or Stage Pocket.
An existing model selection stays in place. Choosing a language switches to a compatible model when needed.
The model detects one of its supported languages. Changing the model saves
the Provider configuration and replaces its runtime.
Each speech session currently owns a Worker, released when the session ends or is cancelled.

Hosts must enable `@proj-airi/vite-plugin-sherpaw` to expose model assets.
`provider-inference` owns recognition and Worker cleanup. `stage-ui` supplies model URLs, local asset fetching, the Worker URL, and the Hearing view.
The Provider is unavailable when the host does not include models.
Use this Provider for local streaming recognition without API credentials.
It requires Workers and WebAssembly. Web and Pocket store selected remote models in OPFS.
Desktop development stores selected models in the app user data directory.
Desktop releases bundle X-ASR and store other models in the user data directory.
Sherpaw settings show download state and let users install or remove remote models.
Use a remote Provider when model download size or local memory makes that unsuitable.
The existing VAD pipeline has separate model and runtime downloads.

`libs/inference/transformers-cache` manages the browser cache used by Transformers
and Kokoro. Sherpaw file pairs use the shared model asset repository.

### Compact Stage status

`HearingStatus` shows the shared, always-on microphone session. Place it above a
mobile composer or at the bottom of a desktop Stage. It reads local request
activity, microphone amplitude, the last transcript, and device or provider
errors.

`StatusCapsule` owns the capsule surface and expandable details. Its indicator
slot receives business content: Hearing owns the audio bars, while sign-in owns
its waiting and result icons. The shell has no request or microphone state. Its details
stay inside its layout bounds so Electron can include them in mouse hit testing.
`HearingStatus` uses the details slot to match chat error cards without adding
microphone failures to chat history.
The component supports reduced motion. Desktop users can enable Streamer mode in
General settings to hide these overlays without stopping microphone input or sign-in.
Streamer mode is off by default.

## Chat stickers

Open **Settings → Modules → Stickers**, then enable stickers. This preference is off by default and applies to this device.
Select a frequency: 25%, 50%, 75%, or 100%. The default is 50% when enabled.
The percentage controls reply eligibility. It does not force an image or guarantee an exact observed ratio.
The model selects one catalog ID from the image names and emotion tags. No separate emotion classifier runs.
Each prepared or queued request retains its catalog, provider, prompt, and eligibility.
No extra provider, API request, character card, or memory module is required.

### Manage the library

Import a PNG, JPG, WebP, or GIF image. Files must decode successfully and remain within 2 MB and 4096 × 4096 pixels.
Preview the image, enter a name with 1–80 characters, and select at least one emotion tag.
Each image can use several tags. Bundled and imported images use the same catalog format.
Edit any image's name or tags. Imported images also support replacement.
Deletion removes the entry from future catalogs. It does not remove images from existing or already prepared replies.
Unknown saved IDs display a translated placeholder and never become image URLs.

IndexedDB stores metadata and immutable image versions on this device.
Replacement creates a new image ID. Chat slices retain the ID selected when their request was prepared.
Deleted entries retain their images. Archived images use storage until the application's site data is cleared.
Web Locks serialize edits across renderer windows. BroadcastChannel signals refresh the local snapshots without transferring image bytes.
The toggle and frequency follow existing same-origin storage events. Reset restores these preferences without clearing the library.
Cloud chat sync transfers text only. Neither imported images nor sticker slices transfer to another device.
Runtime generation does not require an image service or image-generation model.

### Bundled artwork

The default pack contains twelve generated chibi reactions of AIRI's official blue-haired Live2D character.
See [artwork provenance](src/assets/stickers/README.md) for references, exact prompts, and inspection notes.
These are static assets. No runtime image-generation dependency is included.
The four development-only Fluent Emoji images are removed. No old-ID migration is included.
