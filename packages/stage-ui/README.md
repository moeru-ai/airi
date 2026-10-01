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
