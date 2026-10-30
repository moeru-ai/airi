<script setup lang="ts">
import type { WorkbenchApi } from '@proj-airi/ui-panes'

import { Workbench } from '@proj-airi/ui-panes'
import { formatDuration } from '@proj-airi/ui-timeline/headless'
import { TraceDetail, TraceEventLog, TraceMetrics, TracePipeline, TraceTimeline, TraceToolbar, useTracerView, ViewPresetMenu } from '@proj-airi/ui-trace'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useIOTracerStore } from '../../../stores/devtools/io-tracer'

const PANELS = ['timeline', 'pipeline', 'log', 'detail', 'metrics'] as const

const store = useIOTracerStore()
const { version, subscribed, error, selection } = storeToRefs(store)
const { t, locale } = useI18n()

const follow = ref(true)
/** Follow mode moves the view only while recording. A paused trace has a still clock, so the view stays where the user put it. */
const following = computed(() => follow.value && subscribed.value)
const cursor = shallowRef<number>()
const timelineRef = ref<InstanceType<typeof TraceTimeline>>()
const state = computed(() => {
  void version.value
  return store.timelineView()
})

const { presetKey, presets, hiddenTracks, setVisibility, entities, toggleLane, details, summary } = useTracerView({ state, indexes: () => store.reader.indexes, version, locale })

// Producers skip costly series of tracks that no view shows.
watch(hiddenTracks, (hidden, previous) => {
  if (previous && hidden.size === previous.size && [...hidden].every(path => previous.has(path)))
    return
  if (hidden.size === 0) {
    store.setVisibleTracks('*')
    return
  }
  store.setVisibleTracks([...state.value.tracks.keys()].filter(path => !hidden.has(path)))
})

const counters = computed(() => {
  void version.value
  return state.value.counters
})

const origin = computed(() => Number.isFinite(state.value.start) ? state.value.start : 0)

onMounted(() => {
  void store.start()
})

onUnmounted(() => {
  store.stop()
})

/** Fit shows every record. Follow mode would move the view away again, so it turns off. */
function fitTimeline() {
  follow.value = false
  timelineRef.value?.fit()
}

function toggleRecording() {
  if (subscribed.value)
    store.stop()
  else
    void store.start()
}

/** Drops the records so far and follows the trace clock from now. Recording starts if it was paused. */
function startFromNow() {
  store.clear()
  cursor.value = undefined
  follow.value = true
  if (!subscribed.value)
    void store.start()
}

function handleReady(api: WorkbenchApi) {
  const width = api.width
  const height = api.height
  const detailWidth = Math.max(300, Math.round(width / 5))
  const bottomHeight = Math.max(200, Math.round(height / 3))

  api.addPanel({ id: 'timeline', component: 'timeline', title: t('tamagotchi.settings.devtools.pages.io-tracer.panels.timeline'), params: { icon: 'i-mingcute:timeline-line' }, minimumWidth: 320, minimumHeight: 200 })
  api.addPanel({ id: 'pipeline', component: 'pipeline', title: t('tamagotchi.settings.devtools.pages.io-tracer.panels.pipeline'), params: { icon: 'i-mingcute:route-line' }, position: { referencePanel: 'timeline', direction: 'within' }, inactive: true })
  const detail = api.addPanel({ id: 'detail', component: 'detail', title: t('tamagotchi.settings.devtools.pages.io-tracer.panels.detail'), params: { icon: 'i-mingcute:document-2-line' }, position: { referencePanel: 'timeline', direction: 'right' }, minimumWidth: 260 })
  const log = api.addPanel({ id: 'log', component: 'log', title: t('tamagotchi.settings.devtools.pages.io-tracer.panels.log'), params: { icon: 'i-mingcute:list-ordered-line' }, position: { referencePanel: 'timeline', direction: 'below' }, minimumHeight: 120 })
  api.addPanel({ id: 'metrics', component: 'metrics', title: t('tamagotchi.settings.devtools.pages.io-tracer.panels.metrics'), params: { icon: 'i-mingcute:chart-bar-line' }, position: { referencePanel: 'log', direction: 'within' }, inactive: true })

  detail.group.api.setSize({ width: detailWidth })
  log.group.api.setSize({ height: bottomHeight })
}
</script>

<template>
  <main :class="['flex h-full min-h-0 w-full flex-col overflow-hidden', 'bg-neutral-50/80 dark:bg-neutral-950']">
    <div :class="['min-h-0 flex-1 p-1.5']">
      <Workbench :panels="PANELS" :padded="false" @ready="handleReady">
        <template #timeline>
          <div :class="['flex h-full min-h-0 flex-col']">
            <TraceToolbar
              :recording="subscribed"
              :following="following"
              :has-cursor="cursor !== undefined"
              @toggle-recording="toggleRecording"
              @start-from-now="startFromNow"
              @toggle-follow="follow = !follow"
              @fit="fitTimeline"
              @clear-cursor="cursor = undefined"
              @export="store.saveRecords()"
            >
              <template #leading>
                <!-- The host puts its navigation here, for example a back button. -->
                <slot name="leading" />
              </template>
            </TraceToolbar>
            <TraceTimeline
              ref="timelineRef"
              :state="state"
              :indexes="store.reader.indexes"
              :version="version"
              :lanes="entities.lanes"
              :connectors="entities.connectors"
              :details="details"
              :selection="selection"
              :cursor="cursor"
              :follow="following"
              :now="store.traceNow"
              :hidden="hiddenTracks"
              @select="store.select($event)"
              @cursor="cursor = $event"
              @unfollow="follow = false"
              @toggle="toggleLane"
              @visibility="setVisibility"
            >
              <template #corner>
                <ViewPresetMenu v-model="presetKey" :presets="presets" :locale="locale" />
              </template>
              <template #status>
                <span :class="['flex items-center gap-1.5 tabular-nums']">
                  <span :class="['size-1.5 rounded-full', summary.running ? 'bg-primary-500 animate-pulse' : subscribed ? 'bg-neutral-400' : 'bg-amber-500']" />
                  <span :class="['font-medium', summary.running ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-600 dark:text-neutral-300']">
                    {{ !subscribed ? t('tamagotchi.settings.devtools.pages.io-tracer.status.paused') : summary.running ? t('tamagotchi.settings.devtools.pages.io-tracer.status.running') : t('tamagotchi.settings.devtools.pages.io-tracer.status.idle') }}
                  </span>
                </span>
                <span :class="['tabular-nums']">{{ t('tamagotchi.settings.devtools.pages.io-tracer.status.duration') }} <span :class="['text-neutral-700 dark:text-neutral-200']">{{ formatDuration(summary.durationMs) }}</span></span>
                <span v-if="summary.tokens > 0" :class="['tabular-nums']">{{ t('tamagotchi.settings.devtools.pages.io-tracer.status.tokens', { count: summary.tokens.toLocaleString() }) }}</span>
                <span :class="['tabular-nums']">{{ t('tamagotchi.settings.devtools.pages.io-tracer.status.records', { count: counters.records }) }}</span>
                <span v-if="counters.late > 0" :class="['text-amber-600']">{{ t('tamagotchi.settings.devtools.pages.io-tracer.status.late', { count: counters.late }) }}</span>
                <span v-if="counters.reordered > 0" :title="t('tamagotchi.settings.devtools.pages.io-tracer.status.reordered-description')">
                  {{ t('tamagotchi.settings.devtools.pages.io-tracer.status.reordered', { count: counters.reordered }) }}
                </span>
                <span v-if="error" :class="['text-red-600']">{{ error }}</span>
              </template>
            </TraceTimeline>
          </div>
        </template>

        <template #pipeline>
          <TracePipeline :state="state" :version="version" :locale="locale" :cursor="cursor" :now="store.traceNow" />
        </template>

        <template #log>
          <TraceEventLog :log="store.eventLogView()" :version="version" :origin="origin" :late="counters.late" @select="store.select($event)" />
        </template>

        <template #detail>
          <TraceDetail
            v-if="selection"
            :state="state"
            :indexes="store.reader.indexes"
            :version="version"
            :selection="selection"
            @select="store.select($event)"
          />
          <p v-else :class="['p-3 text-xs text-neutral-500']">
            {{ t('tamagotchi.settings.devtools.pages.io-tracer.detail.empty') }}
          </p>
        </template>

        <template #metrics>
          <TraceMetrics :state="state" :samples="store.metricSamples()" :version="version" :locale="locale" />
        </template>
      </Workbench>
    </div>
  </main>
</template>
