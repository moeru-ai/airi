<script setup lang="ts">
import type { TracePipelineDefinition } from '@proj-airi/trace-kit'
import type { TimelineState } from '@proj-airi/trace-kit/projections'

import { localize } from '@proj-airi/trace-kit'
import { pipelineNodes } from '@proj-airi/trace-kit/views'
import { useIntervalFn } from '@vueuse/core'
import { computed, ref } from 'vue'

const props = defineProps<{
  state: TimelineState
  version: number
  locale: string
  /** The scrub cursor. Without it, the view shows now. */
  cursor?: number
  now: () => number | undefined
}>()

/** The view without a cursor follows now, so it updates without records too. */
const tick = ref(0)
useIntervalFn(() => tick.value++, 250)

const pipelines = computed(() => {
  void props.version
  const result: TracePipelineDefinition[] = []
  for (const [key, data] of props.state.definitions) {
    if (key.startsWith('pipeline/'))
      result.push(data as TracePipelineDefinition)
  }
  return result
})

const at = computed(() => {
  void tick.value
  return props.cursor ?? props.now() ?? props.state.end
})

const views = computed(() => {
  void props.version
  return pipelines.value.map(pipeline => ({
    pipeline,
    label: localize(pipeline.label, props.locale) ?? pipeline.key,
    nodes: pipelineNodes(props.state, pipeline, at.value, props.locale),
  }))
})

const IDLE_CARD = 'bg-neutral-50 ring-neutral-200/60 dark:bg-neutral-900 dark:ring-neutral-800/60'

/** Statuses of a stage that does work now. */
const ACTIVE_STATUSES = new Set(['busy', 'speaking', 'playing', 'running'])

/**
 * The look of a status: the dot in the top right of the node, and a tint of active and failed nodes. Idle nodes stay
 * plain, so the active ones stand out.
 */
function statusTone(status: string): { dot: string, card: string, active: boolean } {
  if (ACTIVE_STATUSES.has(status))
    return { dot: 'bg-primary-500 dark:bg-primary-400', card: 'bg-primary-500/8 ring-primary-400/25', active: true }
  if (status === 'error')
    return { dot: 'bg-red-500', card: 'bg-red-500/8 ring-red-400/25', active: false }
  if (status === 'idle')
    return { dot: 'bg-neutral-300 dark:bg-neutral-600', card: IDLE_CARD, active: false }
  return { dot: 'bg-amber-500', card: 'bg-amber-500/8 ring-amber-400/25', active: false }
}
</script>

<template>
  <div :class="['flex-1 min-h-0 overflow-auto', 'p-4', 'text-xs']">
    <div v-if="views.length === 0" :class="['text-neutral-500']">
      No pipeline definitions yet. A source announces them when it starts.
    </div>
    <section v-for="view in views" :key="view.pipeline.key" :class="['mb-6']">
      <h3 :class="['mb-2 font-semibold text-sm']">
        {{ view.label }}
        <span :class="['ml-2 font-normal text-neutral-500']">{{ cursor !== undefined ? 'at cursor' : 'now' }}</span>
      </h3>
      <div :class="['flex flex-wrap items-stretch gap-2']">
        <template v-for="(node, index) in view.nodes" :key="node.key">
          <div v-if="index > 0 && view.nodes[index - 1]!.stage !== node.stage" :class="['self-center text-neutral-400']">
            →
          </div>
          <div
            :class="[
              'relative flex flex-col gap-0.5 min-w-28 px-2.5 py-2 rounded-lg',
              'ring-2 transition-colors duration-200',
              node.observed ? statusTone(node.status).card : [IDLE_CARD, 'opacity-50'],
            ]"
            :data-status="node.status"
          >
            <span v-if="node.observed" :class="['absolute right-2 top-2 flex size-2']">
              <span v-if="statusTone(node.status).active" :class="['absolute inline-flex size-full animate-ping rounded-full opacity-60', statusTone(node.status).dot]" />
              <span :class="['relative inline-flex size-2 rounded-full', statusTone(node.status).dot]" />
            </span>
            <div :class="['pr-3 font-semibold']">
              {{ node.label }}
            </div>
            <div v-if="node.instance" :class="['text-neutral-500']">
              {{ node.instance }}
            </div>
            <div :class="['font-mono']">
              {{ node.observed ? node.status : 'no data' }}
            </div>
            <div v-for="span in node.open.slice(0, 3)" :key="span.key" :class="['truncate text-neutral-500']">
              {{ span.name }}
            </div>
          </div>
        </template>
      </div>
      <div :class="['mt-2 flex flex-wrap gap-x-4 gap-y-1 text-neutral-500']">
        <span v-for="edge in view.pipeline.edges" :key="`${edge.from}-${edge.to}-${edge.name}`">
          {{ edge.from }} → {{ edge.to }} · {{ edge.kind }} · {{ edge.name }}
        </span>
      </div>
    </section>
  </div>
</template>
