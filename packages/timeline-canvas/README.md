# @proj-airi/timeline-canvas

Canvas 2D timeline lanes for very many intervals, points, and sample series. The package has no framework and no
trace format. A view, for example the IO tracer, fills the columns from its own data and draws one row at a time.

## Use it for

- Timelines with up to millions of items, where DOM elements for each item are too slow.
- Waveforms and level curves, such as audio and VAD, that need a min/max envelope at any zoom.
- Hover and click on items without a hidden color buffer.

## Do not use it for

- A few dozen items with rich content. DOM elements are simpler there.
- Editing clips, trims, or keyframes. This package draws read-only lanes.

## How it works

| Part | What it does |
| --- | --- |
| `IntervalColumn`, `PointColumn` | Items as columns of typed arrays, sorted by start, with a style index and a key each. An open interval has the end `NaN`. |
| `intervalRuns` | The shapes of the visible intervals. A binary search finds the visible range. Intervals narrower than 2 px merge with touching intervals of the same style, so a zoomed-out view draws about as many shapes as it has pixels. |
| `pointMarks` | Dots for sparse points, and a histogram of 3 px buckets for dense points. |
| `SeriesPyramid` | Samples with a min/max pyramid. An envelope reads the coarsest level that still has two buckets per pixel. |
| `hitInterval`, `hitPoint` | The item under an x offset, with a pixel tolerance. |
| `drawIntervalRuns`, `drawPointMarks`, `drawEnvelope` | Trace-view drawing: capsules, a soft tint for thinking, stripes for waiting, a red tint, outline, and status dot for errors, a shimmer for open work, waveforms, and lines. A capsule draws a glyph at its start and a trailing text, for example its duration, at its end. The consumer gives the glyph paths through `glyphs`, so any icon set works. |
| `capsuleStyle`, `laneCapsuleStyle`, `StyleTable` | The look of a capsule from its state: activity, open, failed, retry, cancelled, abandoned, overdue, and dimmed. |
| `drawTimelineRow`, `ROW_GEOMETRY` | One row from state bands, item layers, instants, and an optional series inside the items: a waveform or a chart. |

## Draw a row

Fill the columns, give each item a style from its state, and draw the row. A view and its stories call the same
function, so both look the same.

```ts
import { capsuleStyle, drawTimelineRow, IntervalColumn, ROW_GEOMETRY, StyleTable } from '@proj-airi/timeline-canvas'

const styles = new StyleTable()
const column = new IntervalColumn()
column.append(0, 400, styles.index(capsuleStyle({ color: '#3b82f6', activity: 'thinking', failed: true })), 'asr-1')

drawTimelineRow(ctx, { styles: styles.styles, layers: [{ column }] }, {
  view: { start: 0, end: 1000, width: 800 },
  kind: 'detail',
  top: 0,
  height: ROW_GEOMETRY.height.detail,
})
```

A series shows only inside the items of its row, so an item shows what happened during its span. Pass
`content: { kind: 'waveform', level, intensity }` for an audio level, or `content: { kind: 'chart', series }` for any
other value.

The algorithms follow the data lanes of the recorder-minecraft timeline. This package is a new implementation under MIT.

## Limits

- One very long closed interval makes every visible search start at the beginning of the column, because the search
  starts `maxSpan` before the view. Keep such intervals in a separate column.
- An out-of-order append inserts with a copy, and the indices after it move. A caller that keeps indices must rebuild
  them after such an insert.

## Performance

`src/benchmark.test.ts` prints the numbers on each run. On an Apple M-series laptop with Node:

| Items | Append | Zoomed out | 30 s window | Hit test |
| --- | --- | --- | --- | --- |
| 100,000 intervals | 5 ms | 1.0 ms | 0.14 ms | 0.002 ms |
| 1,000,000 intervals | 19 ms | 7.5 ms | 0.06 ms | 0.001 ms |
| 1,000,000 points | | 1.7 ms | | |
| 1,000,000 samples | 14 ms | 0.17 ms | 0.10 ms | |

A zoomed-out view of a million intervals scans every interval, so a view caches its shapes while the window does not
move.
