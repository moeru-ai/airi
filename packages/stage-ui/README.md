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
The catalog leader owns card and default edits. Character selection and resolved
runtime settings belong to each window. A catalog snapshot updates the selected
character's settings without changing that window's selection.

## Character conversations

The card id is the character identity. Do not use its editable name as a key.
A character binds its card settings, display model, and multiple conversations.
Conversation metadata stores the owning `characterId`.

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

Deleting a card does not delete its conversation history. Windows showing the
deleted card select the built-in character. Starting a new turn still requires
an existing owning card. Cloud-only conversations keep the existing default-card
association; this change does not add cloud character synchronization.

The conversation list is filtered by the current account and selected character.
Changing the character updates that list. Deleted-character conversations remain
stored but are not shown under another character.
Card-list model selectors edit explicit card ids, without selecting the card.
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
