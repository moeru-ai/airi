# Stage UI

Shared core for stage

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
**Use the vision model for chat images** for a text-only chat model.
The vision model describes images before the selected chat model replies.
Local history keeps the images. Provider prompts replace images with descriptions,
including images from earlier turns and retries. Earlier images can require another
vision request on later turns. Cloud history currently stores only message text.

Disable this option to send images directly to a chat model that supports them.
Without a configured vision model, images also go directly to the chat model.
Use this flow for chat attachments, not periodic screen capture.

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
model. A different provider without a model stays unconfigured rather than
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

## Announcements

`HoloCoupon` reads public Cloud announcements for the Web or Electron stage. Pass `client="web"` or `client="desktop"`. It uses the current interface locale and shows a bell button only while content is active. Desktop stages use the floating popover. Mobile Web passes `presentation="header"` through the mobile header action slot. Both surfaces expand the card from the bell and collapse it back to the same anchor. The close button stays inside the card. Reduced motion disables this transition.

Set `VITE_CLOUD_API_URL` to a local Cloud origin for development. The default is `https://cloud.airi.build`. Requests omit credentials. A refresh runs every minute while the component is mounted. Local expiry checks run every second. A failed refresh hides cached content.

Use the generated `@proj-airi/cloud-client` contract. Do not add announcement calls to the TS resource API client. Content is plain text. The card has no action button. Closing the panel is local and does not record a read receipt.

Each announcement can include one cover image. The operator selects a portrait or landscape template in Admin. Portrait cards show text beside the cover. Covers fit inside their frames without cropping or repeating, with a soft background around unused space. Desktop landscape cards reveal text on hover or keyboard focus. Mobile landscape cards show the image above the text. The mobile panel follows the selected card height; offscreen cards do not add blank space. Carousel dots scroll horizontally in one row and select any active announcement. The selected announcement stays selected by ID when other entries expire or move; removing it selects the first remaining entry. Touch devices and mobile panels disable autoplay so reading or scrolling does not change the selected card. Cover paths resolve against the configured Cloud origin; image failures preserve the text. Cloud checks publication before redirecting to private storage.

Keyboard-opened announcement panels pause autoplay until closed. Only the selected slide mounts its cover. Electron places the bell opposite the controls dock and freezes that dock while the announcement is open.
