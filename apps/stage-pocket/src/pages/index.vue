<script setup lang="ts">
import type { BackgroundWakeKeyword } from '../modules/background-wake-word'

import Header from '@proj-airi/stage-layouts/components/Layouts/Header.vue'
import InteractiveArea from '@proj-airi/stage-layouts/components/Layouts/InteractiveArea.vue'
import MobileInteractiveArea from '@proj-airi/stage-layouts/components/Layouts/MobileInteractiveArea.vue'

import { BackgroundProvider } from '@proj-airi/stage-layouts/components/Backgrounds'
import { useBackgroundThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { useBackgroundStore } from '@proj-airi/stage-layouts/stores/background'
import { IS_DEV } from '@proj-airi/stage-shared'
import { ViewControlSlider, WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { pinnedKwsVocabulary, resolveWakeWordKeywords, supportedWakeWordKeywords } from '@proj-airi/stage-ui/services/wake-words'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { breakpointsTailwind, useBreakpoints, useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, shallowRef, useTemplateRef } from 'vue'

import WebSocketStatusButton from '../components/websocket-status-button.vue'

import { useBackgroundCallingWords } from '../composables/use-background-calling-words'
import { usePocketHearing } from '../composables/use-pocket-hearing'
import { backgroundCaptureHandoff } from '../modules/background-wake-word'

const paused = ref(false)

function handleSettingsOpen(open: boolean) {
  paused.value = open
}

const positionCursor = useMouse()
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')
const stageViewport = shallowRef({ height: 0, offsetTop: 0 })
const stageSurfaceStyle = computed(() => isMobile.value
  ? {
      position: 'fixed' as const,
      inset: '0',
      height: stageViewport.value.height > 0 ? `${stageViewport.value.height}px` : '100dvh',
      transform: `translate3d(0, ${stageViewport.value.offsetTop}px, 0)`,
      willChange: 'transform',
    }
  : undefined)

const backgroundStore = useBackgroundStore()
const { selectedOption, sampledColor } = storeToRefs(backgroundStore)
const backgroundSurface = useTemplateRef<InstanceType<typeof BackgroundProvider>>('backgroundSurface')
const { stageModelRenderer } = storeToRefs(useSettings())

const { syncBackgroundTheme } = useBackgroundThemeColor({ backgroundSurface, selectedOption, sampledColor })
onMounted(() => syncBackgroundTheme())

const pocketHearing = usePocketHearing(backgroundCaptureHandoff)
const cardStore = useAiriCardStore()
const hearingSettings = useHearingStore()
const audioDevice = useSettingsAudioDevice()
const backgroundKeywords = computed<BackgroundWakeKeyword[]>(() => {
  const resolved = resolveWakeWordKeywords(cardStore.cards, cardStore.wakeWordOwnership)
  return supportedWakeWordKeywords(resolved.keywords, pinnedKwsVocabulary).flatMap((keyword) => {
    const owner = resolved.targets.get(keyword.label)
    if (!owner)
      return []
    return keyword.matches.map(match => ({
      characterId: owner.cardId,
      tokens: match.tokens,
      score: match.score ?? keyword.score,
      threshold: match.threshold ?? keyword.threshold,
    }))
  })
})
useBackgroundCallingWords({
  active: pocketHearing.ready,
  enabled: () => audioDevice.mode === 'wake-word' && audioDevice.enabled && hearingSettings.configured,
  keywords: backgroundKeywords,
  onWake: pocketHearing.armWake,
  onError: error => console.error('Android background calling words failed:', error),
})
</script>

<template>
  <BackgroundProvider
    ref="backgroundSurface"
    class="widgets top-widgets"
    :background="selectedOption"
    :style="stageSurfaceStyle"
    :top-color="sampledColor"
  >
    <div
      :class="[
        'relative z-2 h-full w-100vw overflow-hidden pt-safe md:h-100dvh',
        'flex flex-col',
      ]"
    >
      <!-- header -->
      <div class="px-0 py-1 md:px-3 md:py-3" w-full gap-2>
        <Header class="hidden md:flex" />
      </div>
      <!-- page -->
      <div relative flex="~ 1 row gap-y-0 gap-x-2 <md:col" min-h-0>
        <div relative min-w="1/2" min-h-0 flex-1>
          <div
            absolute left-0 z-15 px-3
            :class="[
              stageModelRenderer === 'live2d' ? 'top-0 h-full py-[20vh]' : 'top-1/2 -translate-y-1/2',
            ]"
          >
            <ViewControlSlider />
          </div>
          <WidgetStage
            h-full w-full
            :enable-orbit-controls="!isMobile"
            :paused="paused"
            :focus-at="{
              x: positionCursor.x.value,
              y: positionCursor.y.value,
            }"
          />
        </div>
        <InteractiveArea v-if="!isMobile" h="85dvh" absolute right-4 flex flex-1 flex-col max-w="500px" min-w="30%" />
      </div>
    </div>
    <Teleport to="body">
      <MobileInteractiveArea
        v-if="isMobile"
        @settings-open="handleSettingsOpen"
        @stage-viewport-change="stageViewport = $event"
      >
        <template v-if="IS_DEV" #status>
          <WebSocketStatusButton />
        </template>
      </MobileInteractiveArea>
    </Teleport>
  </BackgroundProvider>
</template>

<route lang="yaml">
name: IndexScenePage
meta:
  layout: stage
  stageTransition:
    name: bubble-wave-out
</route>
