<script setup lang="ts">
import type { TraceItemRef } from '@proj-airi/trace-kit/views'

import { shallowRef } from 'vue'

import TraceDetail from './trace-detail.vue'
import TraceEventLog from './trace-event-log.vue'
import TraceMetrics from './trace-metrics.vue'
import TracePipeline from './trace-pipeline.vue'

import { readStoryTrace } from '../../stories/story-trace'

const trace = readStoryTrace()
const now = () => trace.now
const firstChunk = trace.state.tracks.get('agents/agent/llm')!.instants[0]!.key
const speaking = trace.state.tracks.get('participants/user/state')!.states[2]!.key

/** Selections of the detail variants. A link in the panel selects its target, like in the tracer. */
const selections = {
  failed: shallowRef<TraceItemRef>({ kind: 'span', key: 'window:main/e1/asr-1' }),
  retry: shallowRef<TraceItemRef>({ kind: 'span', key: 'window:main/e1/asr-2' }),
  model: shallowRef<TraceItemRef>({ kind: 'span', key: 'window:main/e1/llm-1' }),
  instant: shallowRef<TraceItemRef>({ kind: 'instant', key: firstChunk }),
  state: shallowRef<TraceItemRef>({ kind: 'state', key: speaking }),
}
</script>

<template>
  <Story title="Trace panels" group="devtools" :layout="{ type: 'grid', width: 420 }">
    <Variant id="pipeline" title="Pipeline">
      <TracePipeline :state="trace.state" :version="0" locale="en" :now="now" />
    </Variant>

    <Variant id="pipeline-cursor" title="Pipeline at 3 s">
      <TracePipeline :state="trace.state" :version="0" locale="en" :cursor="3000" :now="now" />
    </Variant>

    <Variant v-for="(selection, name) in selections" :id="`detail-${name}`" :key="name" :title="`Detail: ${name}`">
      <TraceDetail :state="trace.state" :indexes="trace.indexes" :version="0" :selection="selection.value" @select="selection.value = $event ?? selection.value" />
    </Variant>

    <Variant id="event-log" title="Event log">
      <div :class="['h-[480px]']">
        <TraceEventLog :log="trace.eventLog" :version="0" :origin="0" :late="0" />
      </div>
    </Variant>

    <Variant id="metrics" title="Metrics">
      <TraceMetrics :state="trace.state" :samples="trace.samples" :version="0" locale="en" />
    </Variant>
  </Story>
</template>
