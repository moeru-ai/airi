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

`/settings/modules/hearing` controls automatic delivery and links to the two detailed pages.

- `/settings/modules/hearing/transcriber` selects the microphone and transcription provider. The playground requests permission when monitoring starts.
- `/settings/modules/hearing/wake-words` lists character pronunciations and their local ownership.

The shared hearing popup owns input mode controls. Auto-send preferences remain on the overview page.
Imported cards keep their pronunciations. The conflict dialog assigns one local owner without deleting either card's data.
