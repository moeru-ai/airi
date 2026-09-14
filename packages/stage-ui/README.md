# Stage UI

Shared core for stage

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


## Manual voice composer

`VoiceComposer` adds hold-to-record input to a chat surface. Bind the text draft
with `v-model` and pass the active `session-id` and the input container as
`input-element`. Use `recording-change` to hide the editable contents while
recording; the status content renders inside that same input shell. Pass `reply-to-message-id` and
`tools` when the surface uses them. Handle `sent` to clear the reply selection.

A short press changes between voice messages and dictation. A long press starts
recording. The button follows the pointer and shrinks as it moves left toward
cancellation. Move up to collapse the lock track and lock recording.
Only the halo follows volume; the timer stays in the input bar. The overlay
excludes that bar while dimming the Stage, background, and chat.
Release sends the voice message or inserts the transcript. Enter starts a locked
recording. Escape cancels it. Locked recordings have explicit finish and cancel
buttons.

The composer owns its microphone stream and transcription session. It cancels
pending input when its chat session changes or the component unmounts. It does
not enable the shared always-on Hearing stream or its automatic send setting.
Use the existing Hearing controls for continuous listening.

Voice messages keep WAV audio in local chat history. Models whose catalogs
declare audio input receive the recording. Other models receive a transcript.
Unknown model capabilities require transcription. Dictation also requires a
configured Hearing provider and model. Providers with streaming input show live
text; providers with file input return text after release. No automatic send
setting applies to dictation drafts.

Cloud chat synchronization currently transfers text only. It does not transfer
voice recordings, just as it does not transfer image attachments.
