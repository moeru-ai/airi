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

The settings home searches every settings page, the settings on it, and the runtime items that a page lists.

- **Settings**: `createSettingsSearch` from `@proj-airi/stage-pages/vite/settings-search` scans each settings route at build time.
  - It follows the components that the page imports.
  - It writes the i18n keys of the names into `meta.searchKeys`, and marks the same elements with `data-settings-search`.
  - A name is `t('key')` in the `label` or `title` prop of a component, a heading, a label, or a legend.
  - A key can use a string constant of the file, a static prop, or a translation helper, such as `tn('enable')`, as its prefix.
- **Excluded content**:
  - Buttons, notices (`Callout`, `Alert`, `ErrorContainer`), and overlay content are not settings, so they are not in the index. A button is a component whose template root is a `<button>` or another button component.
  - A branch that the app build never renders, such as a desktop-only row on the web, is not in the index either.
- **Conditional settings**:
  - When a setting shows only in some state, the scan writes its gate into `meta.searchGates`.
  - The gate of a `v-if` or `v-show` is the control whose `v-model` or `:model-value` binds a value that the condition reads.
    A value is a store field or state of the component. A computed value stands for the values that its getter reads.
  - The gate of a slot that shows only in some state, such as the content of a collapsible section, is the name of the component usage.
  - Each control carries a `value:` marker of the value that it binds. The controls of a `v-for` give the marker to their parent.
  - If the setting is not on the page, search opens a collapsed section, or highlights the gate. Without a gate, a toast says that the setting shows in another state.
- **Runtime items**, such as character cards or models:
  - A page lists them with a sibling `<page>.search.ts`. Its default export is a `SettingsSearchProvider` from `@proj-airi/stage-shared/settings-search`.
  - Each row binds the same key to `data-settings-search`. Build the key with `settingsSearchItemKey`, so a name with spaces stays one key.
  - An item that shows only after another step names those rows as its `gates`, nearest first. For example, a model names the card of its provider.
  - A shared list component, such as `RadioCardManySelect`, takes `searchKeyOf` for its items.
  - A page that renders only part of a long list, such as a grid that mounts rows in batches, reads `useSettingsSearchTarget()` from stage-ui. It renders the named row first.
- **Address**: a result opens its page with one `setting` query parameter for each key, and one `setting-gate` parameter for each gate.
- **Checks**: a production build fails when a name cannot be read, or when a page marks runtime rows without a provider. Development only warns.

## Needs attention

The settings home lists the providers whose last check failed. It shows under the search field and scrolls with the list.

- `useSettingsNeedsAttention()` from stage-ui gives the list. A provider shows only after a check in this session failed, so a status from the last session does not show it.
- Each provider shows the reason of the check, and the modules that use it now, if any. A provider without a brand icon shows the icon of its module kind.
- **Edit** opens the settings page of the provider. **Dismiss** hides it on this device until its config or its failure reason changes.
- `/devtools/provider-checks` shows when the checks run, when each provider was checked, and how often a provider checks itself. It lists the dismissed providers and can show them again. It can make chosen providers fail their check on purpose, to test the list. This choice ends when the app quits.
