# @proj-airi/ui-timeline

Timeline UI for Vue. The `headless` subpath gives the behavior of a time axis with lanes: the view window, follow mode, zoom, pan, a scrub cursor, keyboard control, and an item list for screen readers. The parts set no classes, so each consumer gives its own look. The root export is the AIRI-styled `Timeline`, built from the headless parts.

The package is generic over its items. An item is `{ key: string, kind?: string }`. It has no trace code, and it must not import `@proj-airi/trace-kit`. The trace binding, `@proj-airi/ui-trace`, comes in a later change.

## Use it for

- A timeline whose items a canvas draws, for example the IO tracer or a keyframe editor.
- A view that pans, zooms, follows a live clock, and moves a cursor with the pointer and the keyboard.

## Do not use it for

- A list of events without a time axis. Use a list or a table.
- A chart of values over time. Use a chart library.

## Timeline

`Timeline` draws rows on one canvas with `drawTimelineRow` of [`@proj-airi/timeline-canvas`](../timeline-canvas). The consumer gives the rows and a model for each row. The timeline gives the AIRI palette, the rings of the selected, hovered, and focused items, the connectors, the label column, the hover card, and the cursor line.

```vue
<script setup lang="ts">
import type { RowModel, TimelineRowEntry } from '@proj-airi/ui-timeline'
import type { ListedItem, TimelineItemRef } from '@proj-airi/ui-timeline/headless'

import { Timeline } from '@proj-airi/ui-timeline'
import { ref } from 'vue'

const rows: TimelineRowEntry[] = [{ key: 'a', kind: 'detail', height: 28 }]
const selection = ref<TimelineItemRef>()
const cursor = ref<number>()

declare function modelOf(row: TimelineRowEntry): RowModel
declare function itemsIn(range: { from: number, to: number }): ListedItem[]
</script>

<template>
  <Timeline
    v-model:selection="selection"
    v-model:cursor="cursor"
    :rows="rows"
    :model="modelOf"
    :list-items="itemsIn"
    :start="0"
    :end="5000"
  >
    <template #label="{ row, height }">
      <div :style="{ height: `${height}px` }">
        {{ row.key }}
      </div>
    </template>
    <template #hover="{ item }">
      {{ item.key }}
    </template>
  </Timeline>
</template>
```

Props:

| Prop | Meaning |
| --- | --- |
| `rows` | `TimelineRowEntry[]`: `key`, `kind` (`lane` or `detail`), `height`, and `block`. Rows of one block share one label. A row can carry more fields. |
| `model(row, { now })` | The `RowModel` of a row: interval layers, state bands, points, and styles. It is cached until `version`, the selection, the second of now, or the function itself changes. Pass a new function when the look changes, for example on a theme change. |
| `content(row, view)` | The series inside the capsules of a row, for one frame. |
| `glyphs(id)` | The paths of a glyph ID of an item style, for example an icon. An unknown ID draws no glyph, so glyphs can load later. |
| `listItems(range)` | The items of the hidden item list in the render range. `row` of an item is its row index. |
| `connectors` | Lines between the centers of two rows at a time. |
| `backdrop` | Shaded ranges and lines over the whole height. |
| `provisional` | Items after this time can still change. The lanes after it are shaded. |
| `start`, `end`, `now`, `running`, `version` | As on `TimelineRoot`. |
| `hoverable(item)` | Items that open the hover card. The default is every item. |
| `resizeLabel` | The accessible name of the resize edge. |
| `cursorLabel` | The accessible name of the axis, which is the slider of the cursor. The default is `Cursor`. |

Models: `cursor`, `selection`, `follow`, and `labelWidth` (default 208). The timeline does not store the label width. A consumer that keeps it, for example in local storage, binds `v-model:label-width`.

Slots: `label` (`row`, `rows`, `height`), `hover` (`item`), `corner`, `status`, and `legend`.

Exposed: `fit()`.

`TimelineCapsuleRow` draws one row from plain data, with the same function as `Timeline`. Use it in stories and visual checks.

## Headless parts

Import them from `@proj-airi/ui-timeline/headless`. Each part renders its slot in one plain element, and shares state with `TimelineRoot` through `provide` and `inject`, like reka-ui.

| Part | Behavior |
| --- | --- |
| `TimelineRoot` | The view window, follow mode, zoom, pan, `fit()`, and `reveal()`. The cursor keys: arrows, Shift, Home, End, Ctrl or Cmd with Shift and an arrow, and Escape. |
| `TimelineScrollArea` | The vertical scroll container. The root reads its scroll position and its visible height. |
| `TimelineAxis` | The slider of the cursor. A press, a drag, and the cursor keys move the cursor. Give it an `aria-label`. Slot props: `ticks`, `cursor`, and `position`. |
| `TimelineLanes` | A drag pans, the wheel zooms, and Shift with the wheel pans. A click selects the item of `hitTest`, or moves the cursor and clears the selection. |
| `TimelineCanvas` | A canvas sized to the lanes width, the visible height, and the device pixel ratio. It calls `draw(ctx, frame)` in each animation frame. |
| `TimelineLabelColumn` | A column with the label width of the root. |
| `TimelineLabelResizer` | The resize edge of the label column: drag, arrow keys, and a double click to reset. Props: `defaultWidth`, `min`, `max`, `step`. |
| `TimelineItemList` | The hidden item list: one Tab stop, arrow keys, Home, and End. Events: `focus` and `blur` of keyboard focus. Slot: `item`. |

`TimelineRoot` props and models:

| Name | Kind | Meaning |
| --- | --- | --- |
| `start`, `end` | prop | The time range of the data. `start` is not finite while there is no data. |
| `now` | prop | A function that returns the clock now, or undefined. |
| `running` | prop | Work still runs, so `fit()` also holds now. |
| `version` | prop | Changes when the data changes in place. The ticks recompute on it. |
| `cursor` | `v-model` | The scrub cursor time. |
| `selection` | `v-model` | The selected item. |
| `follow` | `v-model` | The view follows `now`. A pan, a zoom, or `fit()` sets it to `false`. |
| `labelWidth` | `v-model` | The width of the label column over the left of the lanes. |

A custom drawing layer calls `injectTimelineRootContext()` inside the root. The context gives the view, the measured sizes, the ticks, the models, and the methods `timeAt`, `reveal`, `fit`, `focusItem`, and `position`.

The subpath also exports these helpers:

| Export | Contents |
| --- | --- |
| `neighborItem`, `ITEM_MOVE_KEYS`, `ListedItem`, `ItemMove` | Keyboard moves between the items of the item list |
| `tickIntervalMs`, `formatTick`, `formatOffset`, `formatDuration` | Tick intervals and time text |
| `followWindowMs`, `FOLLOW_LEAD_MS` | The window steps of follow mode |

## Exports

| Export | Contents |
| --- | --- |
| `Timeline` | The AIRI-styled timeline |
| `TimelineCapsuleRow`, `PreviewItem`, `PreviewContent`, `PreviewSeries` | One row from plain data |
| `RowModel`, `IntervalLayer`, `RowModelContext` | The canvas content of a row |
| `TimelineRowEntry`, `TimelineConnector`, `TimelineBackdrop` | The props of `Timeline` |

## Tests

Run `pnpm -F @proj-airi/ui-timeline test:run`. The node project runs the helper tests. The browser project runs the component tests in Chromium.

## License

[MIT](../../LICENSE)
