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
