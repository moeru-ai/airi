# Stage UI

Shared core for stage

## Account context in chat

Each model request reads the current account display name and the last successful
Flux balance query through `createUserAccountContext`. The provider does not fetch
data or change the character card. Existing account refresh actions update the
balance snapshot, which includes its account, session, and query time.

Use this context for natural forms of address and relevant balance questions.
An unknown balance differs from zero. The snapshot is not a live balance or an
access decision. The server owns billing. Sign-out replaces the active account
context, and account switches hide snapshots from other sessions.

Nickname edits belong in **Settings > Account > Profile > Display name** at
`/settings/account`. A nickname requested in chat does not update the account or
persistent memory. Do not put credentials, email addresses, or payment history
in this context.

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

### Project structure

1. If a story is bound to a specific component, it can be placed beside the component in the `src` folder. e.g., `MyComponent.story.vue`
2. If a story is not bound to a specific component, then it should be placed in the `stories` folder. e.g., `MyStory.story.vue`
