<script setup lang="ts">
import Header from '@proj-airi/stage-layouts/components/Layouts/Header.vue'
import LessonInteractiveArea from '@proj-airi/stage-layouts/components/Layouts/LessonInteractiveArea.vue'
import MobileHeader from '@proj-airi/stage-layouts/components/Layouts/MobileHeader.vue'

import { BackgroundProvider } from '@proj-airi/stage-layouts/components/Backgrounds'
import { useBackgroundThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { useBackgroundStore } from '@proj-airi/stage-layouts/stores/background'
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useLessonStore } from '@proj-airi/stage-ui/stores/lesson'
import { ensureLessonHearingFallbackProvider } from '@proj-airi/stage-ui/stores/lesson-voice-hearing-fallback'
import { ensureLessonSpeechFallbackProvider } from '@proj-airi/stage-ui/stores/lesson-voice-speech-fallback'
import { bootstrapPepTutorBackendAuth } from '@proj-airi/stage-ui/stores/peptutor-backend-auth'
import { bootstrapPepTutorVoiceEnvDefaults } from '@proj-airi/stage-ui/stores/provider-env-bootstrap'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { resolveLessonPageUid } from '@proj-airi/stage-ui/utils/lesson-route'
import { resolveLessonStageModelSelection } from '@proj-airi/stage-ui/utils/lesson-stage-model'
import { resolveLessonStageView } from '@proj-airi/stage-ui/utils/lesson-stage-view'
import { breakpointsTailwind, useBreakpoints, useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const lessonStore = useLessonStore()
const { availablePages, selectedPageUid, isConfigured, loading, hasStarted } = storeToRefs(lessonStore)
const settingsStore = useSettings()
const { stageModelRenderer, stageModelSelectedUrl } = storeToRefs(settingsStore)

const route = useRoute()
const router = useRouter()
const positionCursor = useMouse()
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')
const lessonStageView = computed(() => resolveLessonStageView(isMobile.value))

const backgroundStore = useBackgroundStore()
const { selectedOption, sampledColor } = storeToRefs(backgroundStore)
const backgroundSurface = useTemplateRef<InstanceType<typeof BackgroundProvider>>('backgroundSurface')
const { syncBackgroundTheme } = useBackgroundThemeColor({ backgroundSurface, selectedOption, sampledColor })
let lessonStageRecoveryInFlight = false

const queryPageUid = computed(() => {
  const rawPageUid = route.query.page_uid
  return Array.isArray(rawPageUid) ? rawPageUid[0] : rawPageUid
})

const knownLessonPageUids = computed(() =>
  new Set(availablePages.value.map(page => page.value)),
)

function resolvedLessonPageUid() {
  return resolveLessonPageUid(
    queryPageUid.value?.trim(),
    knownLessonPageUids.value,
    selectedPageUid.value,
  )
}

async function replaceLessonPageQuery(pageUid: string) {
  const normalizedPageUid = pageUid.trim()
  const currentPageUid = queryPageUid.value?.trim() || ''

  if (!normalizedPageUid || normalizedPageUid === currentPageUid) {
    return
  }

  await router.replace({
    query: {
      ...route.query,
      page_uid: normalizedPageUid,
    },
  })
}

async function ensureLessonStageModel() {
  if (lessonStageRecoveryInFlight) {
    return
  }

  const nextModelId = resolveLessonStageModelSelection(settingsStore.stageModelSelected)
  const needsRestore = settingsStore.stageModelSelected !== nextModelId
    || stageModelRenderer.value === 'disabled'
    || !stageModelSelectedUrl.value

  if (!needsRestore) {
    return
  }

  lessonStageRecoveryInFlight = true

  try {
    settingsStore.stageModelSelected = nextModelId
    await settingsStore.updateStageModel()
  }
  finally {
    lessonStageRecoveryInFlight = false
  }
}

watch(selectedPageUid, async (pageUid) => {
  if (!pageUid || queryPageUid.value === pageUid) {
    return
  }

  await replaceLessonPageQuery(pageUid)
})

watch(queryPageUid, async (pageUid) => {
  const nextPageUid = resolvedLessonPageUid()
  if (!nextPageUid) {
    return
  }

  if (typeof pageUid !== 'string' || pageUid.trim() !== nextPageUid) {
    await replaceLessonPageQuery(nextPageUid)
  }

  if (nextPageUid === selectedPageUid.value) {
    return
  }

  try {
    await lessonStore.selectLessonPage(nextPageUid, {
      restartIfStarted: hasStarted.value && isConfigured.value,
    })
  }
  catch {
  }
})

watch([stageModelRenderer, stageModelSelectedUrl], ([renderer, modelUrl]) => {
  if (renderer === 'disabled' || !modelUrl) {
    void ensureLessonStageModel()
  }
}, { immediate: true })

onMounted(async () => {
  await ensureLessonStageModel()
  syncBackgroundTheme()
  await bootstrapPepTutorBackendAuth().catch(() => undefined)
  await bootstrapPepTutorVoiceEnvDefaults()
  await ensureLessonHearingFallbackProvider().catch(() => false)
  await ensureLessonSpeechFallbackProvider().catch(() => false)
  await lessonStore.loadCatalog()

  const nextPageUid = resolvedLessonPageUid()
  if (!nextPageUid) {
    return
  }

  await replaceLessonPageQuery(nextPageUid)

  if (nextPageUid !== selectedPageUid.value) {
    await lessonStore.selectLessonPage(nextPageUid)
  }

  if (isConfigured.value && !loading.value) {
    try {
      await lessonStore.startLesson(nextPageUid)
    }
    catch {
    }
  }
})
</script>

<template>
  <BackgroundProvider
    ref="backgroundSurface"
    :background="selectedOption"
    :top-color="sampledColor"
    class="widgets top-widgets"
  >
    <div :class="['relative z-2 flex h-100dvh w-100vw flex-col overflow-hidden']">
      <div :class="['w-full gap-2 px-0 py-1 md:px-3 md:py-3']">
        <Header class="hidden md:flex" />
        <MobileHeader class="flex md:hidden" />
      </div>

      <div
        :class="[
          'relative flex min-h-0 flex-1 gap-3 px-3 pb-3',
          isMobile ? 'flex-col' : 'flex-row',
        ]"
      >
        <div
          :class="[
            'relative min-h-0 min-w-0 overflow-hidden rounded-[28px] border-2 border-solid border-white/40 bg-white/18 shadow-[0_30px_80px_-45px_rgba(15,23,42,0.8)] backdrop-blur-sm',
            'dark:border-neutral-800/70 dark:bg-neutral-950/30',
            isMobile ? 'h-[34dvh] shrink-0' : 'flex-1',
          ]"
        >
          <WidgetStage
            :paused="false"
            :lesson-safe="true"
            :lesson-speech="true"
            :focus-at="{
              x: positionCursor.x.value,
              y: positionCursor.y.value,
            }"
            :x-offset="lessonStageView.xOffset"
            :y-offset="lessonStageView.yOffset"
            :scale="lessonStageView.scale"
          />
        </div>

        <div
          :class="[
            'min-h-0',
            isMobile ? 'flex-1' : 'w-[min(36vw,540px)] shrink-0',
          ]"
        >
          <LessonInteractiveArea :mobile="isMobile" />
        </div>
      </div>
    </div>
  </BackgroundProvider>
</template>

<route lang="yaml">
name: LessonScenePage
meta:
  layout: stage
  stageTransition:
    name: bubble-wave-out
</route>
