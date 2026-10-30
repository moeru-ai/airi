<script setup lang="ts">
import type { PreviewContent, PreviewItem } from '@proj-airi/ui-timeline'

import { LONG_LEADING_SILENCE as recording } from '@proj-airi/trace-kit/testing'
import { TimelineCapsuleRow } from '@proj-airi/ui-timeline'

const VIOLET = '#8b5cf6'
const BLUE = '#3b82f6'
const RED = '#ef4444'
const AMBER = '#f59e0b'
const GREEN = '#22c55e'
const ROSE = '#f87171'
const INDIGO = '#6366f1'
const SKY = '#0ea5e9'

/** One row of a story: a row name and the props of a capsule row. */
interface StoryRow {
  name?: string
  kind?: 'lane' | 'detail'
  items?: PreviewItem[]
  points?: { time: number, color: string }[]
  content?: PreviewContent
  view?: { start: number, end: number }
  now?: number
}

interface StoryVariant {
  id: string
  title: string
  description: string
  rows: StoryRow[]
}

/** The real recording of `LONG_LEADING_SILENCE`: its level and its VAD probability. */
const RECORDING_VIEW = { start: 0, end: 5300 }

/** The recording, moved by `offsetMs`. */
function recordingAt(offsetMs: number) {
  const times = recording.times.map(time => time + offsetMs)
  return { level: { times, values: recording.level }, probability: { times, values: recording.probability } }
}

const input = recordingAt(0)
const inputContent: PreviewContent = { kind: 'waveform', level: input.level, intensity: input.probability }

/** Ten thousand 20 ms items over 400 s. Zoomed out, touching items of one style merge into runs. */
const denseItems: PreviewItem[] = Array.from({ length: 10_000 }, (_, index) => ({
  start: index * 40 + (index % 7) * 3,
  end: index * 40 + (index % 7) * 3 + 20,
  color: index % 3 === 0 ? VIOLET : GREEN,
  activity: index % 3 === 0 ? 'thinking' : 'active',
}))

const OVERVIEW_VIEW = { start: 0, end: 12_000 }
const overviewInput = recordingAt(200)

const variants: StoryVariant[] = [
  {
    id: 'overview',
    title: 'Overview',
    description: 'One voice turn with every capsule kind, in the sizes of the IO tracer. The voice input is a real recording with its real VAD.',
    rows: [
      { name: 'User', kind: 'lane', items: [{ start: 1084, end: 4764, color: BLUE }, { start: 4764, end: 5500, color: BLUE, activity: 'thinking', failed: true }] },
      { name: 'Voice input', items: [{ start: 200, end: 5500, color: INDIGO, activity: 'waiting' }], content: { kind: 'waveform', level: overviewInput.level, intensity: overviewInput.probability } },
      { name: 'Speech', items: [{ start: 1084, end: 2748, color: AMBER }, { start: 3964, end: 4764, color: AMBER }] },
      { name: 'Speech recognition', items: [{ start: 4764, end: 5150, color: BLUE, activity: 'thinking', failed: true }, { start: 5150, end: 5500, color: BLUE, activity: 'thinking', retry: true }] },
      { name: 'Agent', kind: 'lane', now: 12_000, items: [{ start: 5500, end: 7000, color: VIOLET, activity: 'waiting' }, { start: 7000, end: 10_000, color: VIOLET }, { start: 10_200, color: VIOLET, activity: 'thinking' }] },
      { name: 'Playback', items: [{ start: 7000, end: 10_000, color: ROSE }], content: { kind: 'waveform', ...recordingAt(7000 - 884) } },
      { name: 'Chat turn', items: [{ start: 5500, end: 7000, color: VIOLET, activity: 'waiting' }] },
      { name: 'Model', now: 12_000, items: [{ start: 5550, end: 6800, color: VIOLET, activity: 'thinking' }, { start: 10_200, color: VIOLET, activity: 'thinking' }] },
      { name: 'Events', points: [300, 5550, 7000, 10_200].map(time => ({ time, color: BLUE })).concat({ time: 4764, color: RED }) },
    ].map(row => ({ view: OVERVIEW_VIEW, ...row } as StoryRow)),
  },
  {
    id: 'activity',
    title: 'Activity',
    description: 'Active work is solid, thinking is a soft tint, and waiting is striped. On a lane, active work covers thinking, and thinking covers waiting.',
    rows: [
      { name: 'Track', items: [{ start: 40, end: 300, color: VIOLET }, { start: 340, end: 640, color: VIOLET, activity: 'thinking' }, { start: 680, end: 960, color: VIOLET, activity: 'waiting' }] },
      { name: 'Lane', kind: 'lane', items: [{ start: 40, end: 900, color: VIOLET, activity: 'waiting' }, { start: 200, end: 760, color: VIOLET, activity: 'thinking' }, { start: 420, end: 600, color: VIOLET }] },
    ],
  },
  {
    id: 'states',
    title: 'States',
    description: 'Failed: the item color under a faint red tint and outline, with a red status dot in the top left corner. Retry: a circular arrow. Cancelled: faded. Abandoned: a gray outline. Overdue: an amber outline. Dimmed: not related to the selection. On a lane, a failure keeps its color and draws on top.',
    rows: [
      {
        name: 'Track',
        items: [
          { start: 0, end: 150, color: BLUE, activity: 'thinking', failed: true },
          { start: 170, end: 320, color: BLUE, activity: 'thinking', retry: true },
          { start: 340, end: 490, color: BLUE, cancelled: true },
          { start: 510, end: 660, color: BLUE, abandoned: true },
          { start: 680, end: 830, color: BLUE, activity: 'thinking', overdue: true },
          { start: 850, end: 1000, color: BLUE, dimmed: true },
        ],
      },
      { name: 'Lane', kind: 'lane', items: [{ start: 0, end: 600, color: BLUE }, { start: 400, end: 700, color: BLUE, activity: 'thinking', failed: true }, { start: 700, end: 1000, color: BLUE, activity: 'thinking', retry: true }] },
    ],
  },
  {
    id: 'open',
    title: 'Open work',
    description: 'Thinking or waiting work that has not ended sweeps a shimmer in its own color until it ends.',
    rows: [
      { name: 'Thinking', now: 1000, items: [{ start: 60, color: VIOLET, activity: 'thinking' }] },
      { name: 'Waiting', now: 700, items: [{ start: 300, color: BLUE, activity: 'waiting' }] },
    ],
  },
  {
    id: 'labels',
    title: 'Labels',
    description: 'Items carry no label, because the track name tells what they are. A track with itemLabel: \'name\' labels them, for example with tool names. A label shows when it fits, after the icon of its state.',
    rows: [
      { name: 'Tools', items: [{ start: 20, end: 420, color: SKY, label: 'web_search' }, { start: 440, end: 560, color: SKY, label: 'read_file' }, { start: 580, end: 600, color: SKY, label: 'read_file' }, { start: 620, end: 980, color: SKY, activity: 'thinking', label: 'run_shell_command_with_a_very_long_name' }] },
      { name: 'Tools', items: [{ start: 20, end: 420, color: SKY, activity: 'thinking', failed: true, label: 'web_search' }, { start: 440, end: 840, color: SKY, retry: true, label: 'web_search' }] },
    ],
  },
  {
    id: 'waveform',
    title: 'Waveform',
    description: 'An audio level draws as bars inside its spans: white on a solid item, the item color on a striped one. The VAD probability sets the opacity of each bar, so speech is solid and noise fades.',
    rows: [
      { name: 'Playback', view: RECORDING_VIEW, items: [{ start: 600, end: 2600, color: ROSE }, { start: 2800, end: 4900, color: ROSE }], content: { kind: 'waveform', level: input.level } },
      { name: 'Voice input', view: RECORDING_VIEW, items: [{ start: 100, end: 5200, color: INDIGO, activity: 'waiting' }], content: inputContent },
      { name: '600 ms', view: { start: 700, end: 1300 }, items: [{ start: 100, end: 5200, color: INDIGO, activity: 'waiting' }], content: inputContent },
    ],
  },
  {
    id: 'chart',
    title: 'Chart',
    description: 'Any other series draws as a line inside its spans, with an optional dashed threshold. Here the VAD probability of the recording is the series. A track with only a series draws it across the row.',
    rows: [
      { name: 'In spans', view: RECORDING_VIEW, items: [{ start: 800, end: 2800, color: BLUE, activity: 'thinking' }, { start: 3800, end: 4800, color: BLUE }], content: { kind: 'chart', series: input.probability, threshold: 0.5 } },
      { name: 'Series only', view: RECORDING_VIEW, content: { kind: 'chart', series: input.probability, threshold: 0.5 } },
    ],
  },
  {
    id: 'aggregation',
    title: 'Aggregation',
    description: '10,000 items. Zoomed out, items narrower than 2 px merge with touching items of the same style. Zoomed in, each item draws alone.',
    rows: [
      { name: '400 s', items: denseItems, view: { start: 0, end: 400_000 } },
      { name: '20 s', items: denseItems, view: { start: 100_000, end: 120_000 } },
      { name: '1 s', items: denseItems, view: { start: 100_000, end: 101_000 } },
    ],
  },
  {
    id: 'points',
    title: 'Points',
    description: 'Sparse instants are dots. When they are denser than one for each 3 px, they become a histogram with a log scale.',
    rows: [
      { name: 'Sparse', points: [80, 240, 260, 520, 700, 910].map(time => ({ time, color: BLUE })) },
      { name: 'Dense', points: Array.from({ length: 20_000 }, (_, index) => ({ time: (index * index) % 1000 + Math.sin(index) * 3, color: index % 5 === 0 ? RED : BLUE })) },
    ],
  },
]
</script>

<template>
  <Story title="Timeline capsules" group="devtools" :layout="{ type: 'single', iframe: false }">
    <Variant v-for="variant in variants" :id="variant.id" :key="variant.id" :title="variant.title">
      <div :class="['flex flex-col gap-3 p-4 text-xs text-neutral-500']">
        <p>{{ variant.description }}</p>
        <div :class="['grid grid-cols-[9rem_minmax(0,1fr)] items-center overflow-hidden rounded-md bg-neutral-50 dark:bg-neutral-900']">
          <template v-for="(row, index) in variant.rows" :key="index">
            <span :class="['px-3 text-[13px] text-neutral-700 dark:text-neutral-300']">{{ row.name }}</span>
            <TimelineCapsuleRow :kind="row.kind" :items="row.items" :points="row.points" :content="row.content" :view="row.view" :now="row.now" />
          </template>
        </div>
      </div>
    </Variant>
  </Story>
</template>
