<script setup lang="ts">
import Header from '@proj-airi/stage-layouts/components/Layouts/Header.vue'
import InteractiveArea from '@proj-airi/stage-layouts/components/Layouts/InteractiveArea.vue'
import MobileInteractiveArea from '@proj-airi/stage-layouts/components/Layouts/MobileInteractiveArea.vue'

import { BackgroundProvider } from '@proj-airi/stage-layouts/components/Backgrounds'
import { useBackgroundThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { useBackgroundStore } from '@proj-airi/stage-layouts/stores/background'
import { IS_DEV } from '@proj-airi/stage-shared'
import { ViewControlSlider, WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useStartupResourcesStore } from '@proj-airi/stage-ui/stores/startup-resources'
import { useVoiceStore } from '@proj-airi/stage-ui/stores/voice'
import { breakpointsTailwind, useBreakpoints, useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue'

import WebSocketStatusButton from '../components/websocket-status-button.vue'

const paused = ref(false)
const modelRenderState = ref<'pending' | 'loading' | 'mounted'>('pending')
const modelRenderError = ref<Error>()
const startup = useStartupResourcesStore()

watch([modelRenderState, modelRenderError, () => startup.resources.find(resource => resource.id === 'model')?.status], ([state, error, status]) => {
  if (status !== 'loading')
    return
  if (error)
    startup.fail('model', error)
  else if (state === 'mounted')
    startup.complete('model')
})

function markModelFailed(error: Error) {
  modelRenderError.value = error
}

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

const voice = useVoiceStore()
const { enabled } = storeToRefs(useSettingsAudioDevice())
watch(enabled, (value) => {
  if (value)
    voice.startListening()
  else
    void voice.stopListening()
}, { immediate: true })
onUnmounted(() => {
  void voice.stopListening()
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
            v-model:state="modelRenderState"
            h-full w-full
            :enable-orbit-controls="!isMobile"
            :paused="paused"
            :focus-at="{
              x: positionCursor.x.value,
              y: positionCursor.y.value,
            }"
            @error="markModelFailed"
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
