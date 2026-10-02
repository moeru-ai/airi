# Stage UI

Shared core for stage

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

## Conversation bindings

External inputs use `overrides.binding` to identify their scene. The session leader creates or recovers a persistent session for that binding.
Bindings belong to a user and character partition. Recovery keeps the calling window's selected conversation unchanged.
Discord uses one binding per channel, including threads and direct messages.
Conversation forks retain their parent session, reason, hidden flag, bindings, and audience. Binding recovery never selects a fork.
Each session has an allowed `audience`. It starts from its bindings and only narrows through `narrowSessionAudience`.
A scene recovers only a root session whose audience still includes the scene audience. Otherwise the scene starts a new session.
Every chat run reaches the owner chat. A reply with an output target also reaches the session's scene. A module without a declared scene speaks for the owner.
`useModuleDirectoryStore` keeps the server's module list with validated declarations. Input from a module with scenes needs a matching binding and cannot name a session.
An invalid declaration, for example a scene outside the module's namespace, rejects the module's input. The intake trace records each rejection.
`sendAdmittedSparkCommand` admits chat tool and notification commands for their run, then sends them. A rejection names the modules that accept the intent.
Settings > Memory > Attention selects a classifier: none, a Decisions API endpoint, or a chat model that answers in a forced tool call. Users set its trust threshold.
The Decisions backend defaults to OpenRouter with `inception/mercury-decide:free`. Any endpoint with the same schema works, for example TypeSafe.
`useTriageStore` decides connection input within 800 ms and appraises notifications within 3 seconds. Without a backend, fixed rules decide.
The chat model classifier receives only its own tool and system prompt, never the built-in tools.
The settings page starts the chat model classifier from the conversation provider, lists that provider's models, and falls back to its default model.
While no run is active, the leader appraises the owner scene's observations at the idle check interval. A confident yes becomes an internal proposal.
`propose` offers internal work to the same intake. A chain deeper than two proposals is rejected. An admitted proposal becomes a notification run, which can still stay silent.
Unchanged observations are not appraised again. Without a classifier, idle appraisal does nothing.
The context bridge assigns observation audiences from logical readers. Sharing with every reader makes an observation public. Producers cannot set the label.

## Voice ownership

Only a local conversation run has the `voice` output in its envelope. The stage drives speech, motion, and expression only for that run.
A reply with an output target, such as a Discord message, goes to its scene and never speaks locally. Hook contexts carry `sessionId`, `runId`, and `outputs`.
At most one run holds the voice lease. `useSchedulerStore` shares the run table, intake trace, and leases among the run owners of a renderer.
Stop and interruption act on `voiceSessionId`, so background replies in other sessions keep running.
The chat store reports `runningSessionIds` and `streamingMessages` per session. Chat surfaces show the reply of the visible session.
Settings > Memory sets the run limits: 4 concurrent replies, 8 waiting messages per session, a 60-second stall timeout, and a 10-minute deadline.

## Session lifecycle

A session is `active` while a run uses it and `idle` after the run ends. The leader moves idle sessions to `dormant`, then `retired`.
Settings > Memory sets both thresholds. The defaults are 30 minutes and 30 days, counted from the last run.
A dormant session still recovers for its scene. A retired session leaves binding recovery, and an explicit run reactivates it.
An `active` state without a running run returns to idle, for example after the previous leader closed. Lifecycle changes do not unload or archive history.
`setSessionDigest` stores a summary that ends at a message in its session. The digest keeps the session audience at the time of writing.

Array `destinations` on `context:update` route transport peers. The object form `{ include, exclude, all }` names logical readers.
A module observation without logical readers belongs to `owner:private`. Bound scenes, such as Discord channels, do not read it.
Module observations enter chat through a session-filtered context snapshot. Minecraft owns its status and relay descriptions in its integration service.
The frontend does not rebuild Minecraft prose or inject it into every request. Request-only providers contain application instructions, not module observations.
Input side context and channel sends use the fixed `events` slot for append updates without a declared `contextId`.
Explicit append slots still require host admission. Unique event identifiers do not create extra append windows.

## Chat output boundaries

Local chat turns stay inside the host. External input captures one server-assigned return connection, which stays attached to its queued turn.
Message and completion events target that connection explicitly. They contain the reply and channel metadata, without prompt or context snapshots.
Discord reads its channel from the top-level `discord` field. Cross-renderer stream projection remains on the local context channel.
Transport targeting does not replace session audience checks. Those checks form the next scheduler stage.

## Toolset guidance

Toolset prompt contributions can name `requiredTools`. The request grants every listed tool before the prompt enters developer instructions.
Contributions without `requiredTools` remain host-wide instructions. Register prompts only from trusted tool owners, never from observation text.
The Spark relay prompt specifies action intent, structured guidance, and truthful submission reports. It is absent when the model cannot use tools.

## Observation details

`builtIn_readContextSource` reads the details behind a `Source details: <type>/<id>` observation.
The request's session must see an observation that carries that handle. The read goes only to the connection that wrote it.
Only that writer can answer. A renderer reads its own handles locally. Answers over 1000 tokens are cut and marked.
The tool wraps details in `<untrusted_content>` tags. Its toolset prompt treats them as data, never instructions.
Renderer producers register readers with `useContextSourceStore().registerSource()`. Vision registers the `vision` type.

## Cross-renderer observation

The producing renderer mirrors every chat hook through the same-origin stream channel, including replies and completions.
Other renderers, such as a devtools window, replay them as observation hooks. A mirror never sends module output again.

## Notification ownership

The synchronized context store routes ingestion, reset, pruning, and writer removal to the elected renderer.
Server module removal clears only the exact extension and module instance. Bounded history prevents delayed copies from restoring removed observations.
The leader retains the latest 400 removal identities. Duplicate notifications cannot erase reconnected observations within that window.
Its checkpoint retains original expiry times. Replicated state holds active slots only.
The leader keeps the bounded delivery history and deduplicates repeated event identities. A promoted leader starts a new dedup window.
Follower projections do not propose state changes. Initialize chat or its context store with the synchronization runtime to start owner-only idle cleanup.
Leadership loss and disposal stop cleanup. Promotion continues from the replicated checkpoint without replaying observations.

Initialize the character orchestrator with the installed Pinia synchronization runtime.
Only the elected renderer runs background notification consumers and reminder ticks. Followers cannot start a ticker manually.
The notification queue is replicated state. Any renderer enqueues through a leader action, and a promoted leader resumes the queue.
Leadership loss stops local consumers. Promotion starts them in the new owner.
Stopping the owner aborts its active notification request and speech intent. Late output cannot issue commands or reactions.
Every notification and due task passes intake. Source urgency sets the prior salience. Immediate work runs at once when the voice is free.
Other work waits by its salience. A notification past its time to live is ignored, and a newer one with the same `coalesceKey` replaces waiting ones.
A due task is an internal stimulus. Each admitted notification is a run with the `voice` output and holds the voice lease until it ends.
A missing chat model ends the run as `blocked`. A stopped owner ends it as `dropped`.
Intake checks hard constraints first: coalescing and deadlines. Only then can a classifier appraise the notification.
Notifications and chat sends wait in one voice line. The tick offers the first due notification in line order, and a released voice triggers it at once.
An admitted notification still decides inside its run whether to speak.
Notification runs count against the shared run limit. With a limit of one, chat sends and notifications run one at a time.
After three blocked runs within a minute, notifications and idle appraisal wait for a one-minute cooldown. Owner input still runs and shows its failure.
`trackSpeechDelivery` follows segment playback for each turn. When playback stops early, the stage records the finished segments through `recordDeliveredSpeech`.
A partly played segment counts as not delivered. A turn that played nothing, for example while speech is muted, records nothing.
Streaming speech providers bypass the segment pipeline, so their interruptions are not recorded yet.
Every chat run request carries the silence tool and its guidance. A silent run shows no reply in the owner chat and sends nothing to a Discord channel.

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
`provider-inference` owns recognition and Worker cleanup. `stage-ui` supplies model URLs, cached fetching, the Worker URL, and the Hearing view.
The Provider is unavailable when the host does not include models.
Use this Provider for local streaming recognition without API credentials.
It requires Workers and WebAssembly. Web and Pocket load the selected model from its pinned remote URL.
Desktop development uses cached local files. Desktop releases bundle all three models.
Use a remote Provider when model download size or local memory makes that unsuitable.
The existing VAD pipeline has separate model and runtime downloads.

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
