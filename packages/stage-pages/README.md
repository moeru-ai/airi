# Stage Pages

`@proj-airi/stage-pages` contains route-level Vue pages that multiple AIRI stage applications share.

## Use

Add a page under `src/pages`. Each stage application scans this directory through its Vite router configuration.

Import a shared page through the package boundary when code needs the component directly:

```ts
import PolaroidPage from '@proj-airi/stage-pages/pages/devtools/polaroid.vue'
```

## When to use this package

Use this package when two or more stage applications need the same page behavior and route structure.

## When not to use this package

Keep application-specific pages in the owning application. Put reusable business components in `@proj-airi/stage-ui`.

Put primitive UI components in `@proj-airi/ui`. Put shared layouts in `@proj-airi/stage-layouts`.

## Provider settings

The active chat and vision provider routes live under `/settings/providers`. They use `ProviderGenerationSettings` from stage-ui to render protocol and native search options from the provider catalog. The V2 editor is a separate consumer and does not replace these routes.

## Hearing settings

`/settings/modules/hearing` is the overview. It holds the shared `HearingConfig` controls (input mode, microphone switch, input device) and the transcript delivery settings (Auto send and transcript rewrite).

- `/settings/modules/hearing/transcriber` selects the transcription provider and model. Its playground asks for microphone permission only when monitoring starts.
- `/settings/modules/hearing/wake-words` lists the wake words of each card and the detector status. When two cards share a pronunciation, the user chooses the character that answers it. The choice stays on the device, and both cards keep their words.

The character card page shows an alert while a shared pronunciation has no character. The alert links to the wake words page.

## Settings search

The settings home searches the settings pages, the settings on them, and the runtime items that a page lists.

- **Modules**: modules in `settingsSearch` from `@proj-airi/stage-ui/libs/settings-search` decide what search lists.
  - A module holds settings routes. A route also holds the routes below it, unless another module names one of them.
  - A route of a module can list runtime items. It can also give a condition to a setting on its page, such as a row that a feature flag adds.
  - `when` turns off a whole module, such as a feature behind a feature flag or a cloud policy.
    While it is false, search lists none of the routes, settings, or items of the module.
  - A route is in the search only when a module holds it, and every module that holds it is on.
  - `settingsSearchModules` from `@proj-airi/stage-pages/settings-search` has the modules of the shared pages.
    Each app provides them and its own modules in `main.ts`. An app that replaces a shared page provides its own module under the same name.
  - A module with items is a `<page>.search.ts` file next to its page. Its default export is the module, and the app loads it lazily.
  - In development, the settings home reports routes that no module holds. It also reports pages that mark item rows when their module lists no items.
- **Settings**: `createSettingsSearch` from `@proj-airi/stage-pages/vite/settings-search` scans each settings route at build time.
  - It reads facts of the templates only. It does not decide what search lists.
  - It follows the components that the page imports.
  - It writes the i18n keys of the names into `meta.searchKeys`, and marks the same elements with `data-settings-search`.
  - A name is `t('key')` in the `label` or `title` prop of a component, a heading, a label, or a legend.
  - A key can use a string constant of the file, a static prop, or a translation helper, such as `tn('enable')`, as its prefix.
- **Excluded content**:
  - Buttons, notices (`Callout`, `Alert`, `ContainerError`), and overlay content are not settings, so they are not in the index. A button is a component whose template root is a `<button>` or another button component.
  - A branch that the app build never renders, such as a desktop-only row on the web, is not in the index either.
- **Conditional settings**:
  - When a setting shows only in some state, the scan writes its gate into `meta.searchGates`.
  - The gate of a `v-if` or `v-show` is the control whose `v-model` or `:model-value` binds a value that the condition reads.
    A value is a store field or state of the component. A computed value stands for the values that its getter reads.
  - The gate of a slot that shows only in some state, such as the content of a collapsible section, is the name of the component usage.
  - Each control carries a `value:` marker of the value that it binds. The controls of a `v-for` give the marker to their parent.
  - If the setting is not on the page, search opens a collapsed section, or highlights the gate. Without a gate, a toast says that the setting shows in another state.
- **Components that runtime data picks**, such as the Hearing controls of the picked transcription provider:
  - The scan of the page cannot reach them. Import the component with `?settings-search` to get its settings and their gates.
  - A provider gives these imports in `viewSearchEntries`, next to its `views`.
- **Runtime items**, such as character cards or models:
  - The module that holds the page lists them in `items` of the route. The type is `SettingsSearchProvider` from `@proj-airi/stage-shared/settings-search`.
  - Each row binds the same key to `data-settings-search`. Build the key with `settingsSearchItemKey`, so a name with spaces stays one key.
  - An item that shows only after another step names those rows as its `gates`, nearest first. For example, a model names the card of its provider.
  - A shared list component, such as `RadioCardManySelect`, takes `searchKeyOf` for its items.
  - A page that renders only part of a long list, such as a grid that mounts rows in batches, reads `useSettingsSearchTarget()` from stage-ui. It renders the named row first.
- **Address**: a result opens its page with one `setting` query parameter for each key, and one `setting-gate` parameter for each gate.
- **Checks**: a production build fails when a name cannot be read. Development only warns.

## Needs attention

The settings home lists the settings that keep a feature in use from working. It shows under the search field and scrolls with the list.

- `useSettingsNeedsAttention()` from stage-ui gives the list.
- An item shows only when a feature in use cannot work, a check or the saved settings confirm the cause, and a settings page fixes it.
- A failed save, a sync problem, or a new version is not an item. The place of the action reports it.
- **Provider not set up**: the required fields of a provider in use are empty, for example after its API key was cleared.
- **Provider check failed**: the last check of a provider in use failed. The item shows the first reason of the check.
- A provider shows only after a check in this session, so a status from the last session does not show it.
- A provider is in use when a module or any character selects it. A chat session resolves its own character, so the active card is not the only user. A provider that nothing uses does not show. The providers page shows its status.
- **Provider cannot be used**: a character or the Hearing module selects a provider that its module page does not list, for example a removed provider. A character keeps this selection, because the person can add the provider again. An added provider of the right kind waits for its check instead: the page lists it after a check passes, and a failed check gives a provider item.
- **Character without a speech model or voice**: the speech of a character has a usable provider, but no model or no voice. Its replies stay text only. `speechFieldStatus()` in the speech store gives the check, and `createOutput` resolves the selection the same way.
- An empty field that a catalog fills later is pending, not missing. The store picks a voice for an official provider, and a streaming provider takes its default model, after the catalog loads. Only a catalog that is loading counts. A catalog that failed, came back empty, or was not requested leaves the field missing.
- **Voice input without transcription**: the microphone is on in the Always on mode, but Hearing has no transcription provider or model. Speech then starts no input. Push to Talk and dictation explain this when the person presses them.
- An item without a brand icon shows the icon of its module kind.
- Blocking items come first. Only a failed check is not blocking, because the next check can pass.
- **Edit** opens the page that fixes the item, scrolled to the row to change and highlighted, as a settings search result opens it. For a character, it is the editor of that character at its modules, also for the active character. A page without that row opens at the top. **Dismiss** hides the item on this device until its cause changes.
- `/devtools/needs-attention` tests this list. It lists every item, also the dismissed ones, and can show a dismissed item again.
- It shows when the provider checks run, when each provider was checked, and how often a provider checks itself. It also shows the provider of each module selection, the speech of each character, and the voice input.
- It can make the list show each kind of item on purpose: a provider fails its check, a module selection cannot be used, a character has no voice, or voice input has no transcription. These choices end when the app quits.
