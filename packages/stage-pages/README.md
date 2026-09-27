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

## Character card previews

The card detail dialog shows the selected card's model binding, not the active character's runtime model. Empty bindings inherit the catalog defaults. Missing models remain visible as unavailable bindings.

The editor uses the same read-only model preview with its draft selection. Selection changes persist only through the existing save actions. The detail dialog opens that editor without activating the card.
