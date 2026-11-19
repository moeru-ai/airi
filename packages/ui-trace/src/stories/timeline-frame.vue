<script setup lang="ts">
import type { TraceItemRef } from '@proj-airi/trace-kit/views'

import { onMounted, ref, shallowRef, useTemplateRef } from 'vue'

import TraceTimeline from '../components/timeline/trace-timeline.vue'

import { useTracerView } from '../composables/use-tracer-view'
import { readStoryTrace } from './story-trace'

/**
 * The timeline of the IO tracer over the voice turn fixture, for stories. It keeps the lanes, the rows, the selection,
 * and the cursor like the tracer, so every control of the timeline works in a story. It fills its parent like the
 * timeline panel of the tracer, so the parent sets its size.
 */
const props = withDefaults(defineProps<{
  selection?: TraceItemRef
  cursor?: number
  /** Keys of the lanes that start collapsed, for example `participant:agent`. */
  collapse?: string[]
  /** Track paths that start hidden. */
  hide?: string[]
}>(), { collapse: () => [], hide: () => [] })

const trace = readStoryTrace()
const state = shallowRef(trace.state)
const version = ref(0)
const locale = ref('en')
const { entities, details, hiddenTracks, collapsed, toggleLane, setVisibility } = useTracerView({ state, indexes: () => trace.indexes, version, locale })
collapsed.value = new Set(props.collapse)
setVisibility(props.hide, false)

const selection = shallowRef<TraceItemRef | undefined>(props.selection)
const cursor = shallowRef<number | undefined>(props.cursor)
const timeline = useTemplateRef<InstanceType<typeof TraceTimeline>>('timeline')

onMounted(() => timeline.value?.fit())
</script>

<template>
  <div :class="['flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-md bg-white dark:bg-neutral-950']">
    <TraceTimeline
      ref="timeline"
      :state="state"
      :indexes="trace.indexes"
      :version="version"
      :lanes="entities.lanes"
      :connectors="entities.connectors"
      :details="details"
      :selection="selection"
      :cursor="cursor"
      :follow="false"
      :now="() => trace.now"
      :hidden="hiddenTracks"
      @select="selection = $event"
      @cursor="cursor = $event"
      @toggle="toggleLane"
      @visibility="setVisibility"
    />
  </div>
</template>
