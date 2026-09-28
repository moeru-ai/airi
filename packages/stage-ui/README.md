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

### Account catalogs and pending sync

`airi-card-catalog` owns an account-scoped IndexedDB record. Its leader actions
persist edits before publishing snapshots. Card projections are read-only.
The first signed-in account claims anonymous characters. Later accounts use
separate catalogs. Switching accounts hides the previous catalog immediately.

`contact-replica` stores pending mutations, deletion identities, and revision
conflicts. Network failures retain the original mutation ids for retry.
Deletion markers take precedence over pending edits. A missing list entry does
not prove deletion. `character-document` exports only portable persona fields
and module selections. Local assets and provider options stay on the device.

Conversation reconciliation synchronizes contacts before listing cloud chats.
New direct chats send the contact identity, not caller-supplied members.
The deletion dialog warns that bound direct histories and cloud copies are deleted.

`components/characters/character-card.vue` owns the portrait, avatar, title, description, and blurred-cover layout shared by the local card library and v2 directory. Its default layout is `portrait`; use `layout="horizontal"` for model summaries in character profiles and the editor. Pass display data through props and page-owned controls through the `cover-actions`, `meta`, and `footer` slots. Do not put stores, navigation, model binding, or remote mutations in this component. The separate menu card remains a different presentation.

The card store owns three distinct states:

- `moduleDefaults` stores global provider, model, voice, and display selections.
- Each card stores explicit overrides. An empty string means inherit.
- Module stores expose the resolved runtime selections used by the application.

Use `configureForAuthentication` for login and logout. It updates global
defaults, then reapplies the active card without saving defaults into that card.
Use card commands for activation and explicit edits. Settings pages must not
save cards from watchers: authentication and remote snapshots also trigger them.
The catalog leader owns card and default edits. Character selection and resolved
runtime settings belong to each window. A catalog snapshot updates the selected
character's settings without changing that window's selection.

## Character conversations

The card id is the character identity. Do not use its editable name as a key.
A character binds its card settings, display model, and multiple conversations.
Conversation metadata stores the owning `characterId` and cloud `contactId`.
An unverified binding has `characterId: null`. The `@unbound` index bucket is
not a character identity. Unbound histories cannot send new model requests.

- Use `useAiriCardStore().activateCard(id)` to select a character.
- Use `useChatSessionStore().createSession(characterId)` to start a conversation.
- Use `setActiveSession(sessionId)` to open history and select its character.
- Use `updateActiveCardDisplayModel(id)` to save a character's display binding.
- Use `updateCardDisplayModel(cardId, id)` to edit a card without selecting it.
- Use `resolveCharacter(id)` to resolve settings for background or leader work.
  Do not read the leader window's current card when handling another conversation.

Shared actions create and hydrate conversation data. Local commands own navigation.
Two windows can therefore show different characters and different conversations.
Each window remembers its last conversation per character during its lifetime.
The persisted index supplies the initial conversation for a new window.
Global vision request policies remain shared in `useVisionSettingsStore`.
Use its explicit actions to change these policies without changing local models.

Deleting a character deletes its bound direct histories and pending message sends.
Deletion advances the session generation to invalidate late responses. Groups remain.
Old cloud records with unknown type wait for verified ownership before local deletion.
Cloud-only conversations use their contact binding. Unknown bindings remain unbound.

The conversation list is filtered by the current account and selected character.
Changing the character updates that list. The separate **Unassigned** view opens
unbound histories without changing the selected character. Select an unbound
direct conversation, then reopen the selector to assign it to the current character.
Group histories stay read-only and cannot be assigned through this control.
Assignment preserves messages and requires a confirmed cloud contact binding.

The character library and profile show pending synchronization and revision conflicts.
Users can keep the device version or the cloud version, then retry synchronization.
The deletion dialog stays open while persistence runs and shows errors for retry.
The card library opens read-only character profiles. Model bindings are edited
in the card editor's Model section, without selecting the card.
An empty binding inherits the global default rather than copying its value.
Shared binding edits affect all windows using that character; selecting a
conversation affects only the current window.

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
