# @proj-airi/ui-panes

Docking panes with tabs for AIRI tool pages. The package wraps [Dockview](https://dockview.dev/) and gives it the AIRI theme: card groups, rounded tabs, and light and dark colors.

The package depends only on `@proj-airi/ui`, Vue, and `dockview-vue`. It has no trace or timeline code.

## Use it for

- A tool page with several views of the same data, for example the IO tracer devtools page.
- Panels that the user can resize, move, and stack as tabs.

## Do not use it for

- A settings form or a page with one view. Use the layouts of `@proj-airi/ui`.
- A layout that the user must not change.

## Usage

```vue
<script setup lang="ts">
import type { WorkbenchApi } from '@proj-airi/ui-panes'

import { Workbench } from '@proj-airi/ui-panes'

const PANELS = ['timeline', 'detail'] as const

function handleReady(api: WorkbenchApi) {
  api.addPanel({ id: 'timeline', component: 'timeline', title: 'Timeline', params: { icon: 'i-mingcute:timeline-line' } })
  api.addPanel({ id: 'detail', component: 'detail', title: 'Detail', position: { referencePanel: 'timeline', direction: 'right' } })
}
</script>

<template>
  <Workbench :panels="PANELS" @ready="handleReady">
    <template #timeline>
      Timeline panel
    </template>
    <template #detail>
      Detail panel
    </template>
  </Workbench>
</template>
```

- Each name in `panels` is a named slot and a Dockview panel component with the same name.
- The page owns the layout. It adds the panels in `ready`.
- A panel can give a tab icon with `params: { icon }`.
- Set `padded` to `false` for a panel that has its own scroll area. Set `floating` to let panels float above the layout.

## Exports

| Export | Contents |
| --- | --- |
| `Workbench` | The docking component |
| `WorkbenchApi` | The Dockview API type that `ready` gives |

## Stories

The stories are next to the components. The Histoire of [`stage-ui`](../stage-ui) loads them through `storyMatch` in its `histoire.config.ts`. Open **Devtools → Workbench**.

## License

[MIT](../../LICENSE)
