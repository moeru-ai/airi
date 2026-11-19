# @proj-airi/ui-trace

Trace UI for AIRI. The package binds the trace views of [`@proj-airi/trace-kit`](../trace-kit) to the generic timeline of [`@proj-airi/ui-timeline`](../ui-timeline). It owns the trace meaning: which rows exist, what the labels and the hover card say, and how a span becomes a capsule.

The package does not own feeds, stores, or routes. The IO tracer page of [`stage-ui`](../stage-ui) puts the store, the panes, and this package together. That page moves to this package in a later change. Until then, no app uses it.

## Use it for

- A timeline of trace records: entity lanes, track rows, handoffs, and span cards.
- The panels of a tracer page: the pipeline, the event log, the details of an item, and the metrics.
- The toolbar and the view preset menu of a tracer page.
- The row models of a trace, for a view that draws trace rows on a canvas.

## Do not use it for

- A timeline of data that is not a trace. Use `@proj-airi/ui-timeline` directly.
- Reading or collecting records. Use `@proj-airi/trace-kit`.

## Usage

```vue
<script setup lang="ts">
import { TraceTimeline } from '@proj-airi/ui-trace'
</script>

<template>
  <TraceTimeline
    :state="state"
    :indexes="indexes"
    :version="version"
    :lanes="entities.lanes"
    :connectors="entities.connectors"
    :details="details"
    :selection="selection"
    :cursor="cursor"
    :follow="following"
    :now="traceNow"
    :hidden="hiddenTracks"
    @select="selection = $event"
    @cursor="cursor = $event"
    @unfollow="follow = false"
    @toggle="toggleLane"
    @visibility="setVisibility"
  >
    <template #corner>
      View menu
    </template>
    <template #status>
      Recording
    </template>
  </TraceTimeline>
</template>
```

- `lanes` and `connectors` come from `buildEntityLanes`. `details` maps a lane key to the rows of `buildRows`.
- `useTracerView` gives `entities`, `details`, `hiddenTracks`, `toggleLane`, and `setVisibility` from the state of a reader.
- The page owns the selection, the cursor, and follow mode. The timeline emits `select`, `cursor`, and `unfollow`.
- The label width stays in local storage under `ui/devtools/io-tracer/label-width`, for each viewer.
- `fit()` fits the view to every record and turns follow mode off.
- Find the parts by role and name, as assistive technology does. The timeline is a group, the axis is the `Cursor` slider, the hidden item list is the `Timeline items` list, and the detail panel is the `Details` complementary landmark.

## Exports

| Export | Contents |
| --- | --- |
| `TraceTimeline` | The trace timeline |
| `TraceDetail`, `TraceEventLog`, `TraceMetrics`, `TracePipeline`, `SpanLinkCard` | The panels. A panel that selects an item emits a `TraceItemRef` of `@proj-airi/trace-kit/views`. |
| `TraceToolbar`, `ViewPresetMenu` | The toolbar of the timeline and the menu of view presets |
| `useTracerView`, `TracerViewSource` | The view preset, the hidden tracks, the entity lanes, the collapsed lanes, and the detail rows of a trace |
| `buildEntityLanes`, `sessionSummary`, `EntityLane`, `EntitySegment`, `EntityConnector` | Entity lanes and the handoffs between them. They write lane labels, for example "User". |
| `buildRows`, `spanInRow`, `rowHeightOf`, `TimelineRow` | Track rows. `buildRows` writes the group labels. |
| `laneRowModel`, `detailRowModel`, `SeriesCache`, `RowModelOptions` | The canvas models of lane rows and track rows. `SeriesCache` appends new samples, and rebuilds a pyramid when the `revision` of its series changes. |
| `spanFacts`, `linkRelationLabel` | The text of a span and of a link relation |

Track and lane colors come from the profiles as CSS colors. `ui-trace` takes the hue of each color and draws
`@proj-airi/chromatic` shades in three roles (`TRACK_SHADES`): a light fill for solid capsules, a stronger accent for
translucent capsules, lane dots, and handoff lines, and a dark ink for the icon, the text, and the waveform inside each
capsule. Light mode uses 200, 400, and 700. Dark mode mirrors them as 800, 600, and 200. A gray color stays as it is.
Red stays for failures, so a profile does not give a track a red color.

`@proj-airi/ui-trace/stories` holds the fixture and the frame of the stories. Only stories import it.

| Export | Contents |
| --- | --- |
| `storyTraceRecords`, `readStoryTrace`, `STORY_TRACE_CLOCK` | The voice turn fixture of `@proj-airi/trace-kit/testing`, as records and as the views of a reader. The fixture is a fixed trace, so `readStoryTrace` keeps every sample (`seriesRetention: false`). |
| `storyTraceFeed` | A `TraceFeedSource` that sends the fixture as its backlog, so a store reads it like a live collector |
| `TimelineFrame` | `TraceTimeline` over the fixture, with the lanes, rows, selection, and cursor of the tracer |

The panels and the toolbar use the strings under `tamagotchi.settings.devtools.pages.io-tracer` of `@proj-airi/i18n`. The host installs vue-i18n with them.

## Stories

The stories are next to the components. The Histoire of [`stage-ui`](../stage-ui) loads them through `storyMatch` in its `histoire.config.ts`. They are in the **Devtools** group:

| Story | File |
| --- | --- |
| Timeline capsules | `src/components/timeline/timeline-capsules.story.vue` |
| Trace timeline | `src/components/timeline/trace-timeline.story.vue` |
| Trace panels | `src/components/panels/trace-panels.story.vue` |
| Trace toolbar | `src/components/toolbar/trace-toolbar.story.vue` |

## Tests

Run `pnpm -F @proj-airi/ui-trace test:run`. The tests cover the row models, the lookups, the colors, and the icon glyphs. After the IO tracer page of `stage-ui` uses this package, its browser test covers the timeline, the panels, and the toolbar.

## License

[MIT](../../LICENSE)
