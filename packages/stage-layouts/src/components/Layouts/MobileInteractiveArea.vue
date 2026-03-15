<script setup lang="ts">
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { ChatHistory, HearingConfigDialog } from '@proj-airi/stage-ui/components'
import { useAudioAnalyzer } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatMaintenanceStore } from '@proj-airi/stage-ui/stores/chat/maintenance'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea, useTheme } from '@proj-airi/ui'
import { useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import IndicatorMicVolume from '../Widgets/IndicatorMicVolume.vue'
import ActionAbout from './InteractiveArea/Actions/About.vue'
import ActionViewControls from './InteractiveArea/Actions/ViewControls.vue'
import ViewControlInputs from './ViewControls/Inputs.vue'

import { BackgroundDialogPicker } from '../Backgrounds'

const { isDark, toggleDark } = useTheme()
const hearingDialogOpen = ref(false)
const chatOrchestrator = useChatOrchestratorStore()
const chatSession = useChatSessionStore()
const chatStream = useChatStreamStore()
const { cleanupMessages } = useChatMaintenanceStore()
const { messages } = storeToRefs(chatSession)
const { streamingMessage } = storeToRefs(chatStream)
const { sending } = storeToRefs(chatOrchestrator)
const historyMessages = computed(() => messages.value as unknown as ChatHistoryItem[])

const viewControlsActiveMode = ref<'x' | 'y' | 'z' | 'scale'>('scale')
const viewControlsInputsRef = useTemplateRef<InstanceType<typeof ViewControlInputs>>('viewControlsInputs')

const messageInput = ref('')
const isComposing = ref(false)
const backgroundDialogOpen = ref(false)

const screenSafeArea = useScreenSafeArea()
const providersStore = useProvidersStore()
const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())

useResizeObserver(document.documentElement, () => screenSafeArea.update())
const { themeColorsHueDynamic, stageViewControlsEnabled } = storeToRefs(useSettings())
const settingsAudioDevice = useSettingsAudioDevice()
const { enabled, selectedAudioInput, stream, audioInputs } = storeToRefs(settingsAudioDevice)
const { ingest, onAfterMessageComposed, discoverToolsCompatibility } = chatOrchestrator
const { t } = useI18n()
const { audioContext } = useAudioContext()
const { startAnalyzer, stopAnalyzer, volumeLevel } = useAudioAnalyzer()
let analyzerSource: MediaStreamAudioSourceNode | undefined

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

async function handleSubmit() {
  if (!isMobileDevice()) {
    await handleSend()
  }
}

async function handleSend() {
  if (!messageInput.value.trim() || isComposing.value) {
    return
  }

  const textToSend = messageInput.value
  messageInput.value = ''

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)

    await ingest(textToSend, {
      chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
      model: activeModel.value,
      providerConfig,
    })
  }
  catch (error) {
    messageInput.value = textToSend
    messages.value.pop()
    messages.value.push({
      role: 'error',
      content: (error as Error).message,
    })
  }
}

function teardownAnalyzer() {
  try {
    analyzerSource?.disconnect()
  }
  catch {}
  analyzerSource = undefined
  stopAnalyzer()
}

async function setupAnalyzer() {
  teardownAnalyzer()
  if (!hearingDialogOpen.value || !enabled.value || !stream.value)
    return
  if (audioContext.state === 'suspended')
    await audioContext.resume()
  const analyser = startAnalyzer(audioContext)
  if (!analyser)
    return
  analyzerSource = audioContext.createMediaStreamSource(stream.value)
  analyzerSource.connect(analyser)
}

watch([hearingDialogOpen, enabled, stream], () => {
  setupAnalyzer()
}, { immediate: true })

watch(hearingDialogOpen, (value) => {
  if (value) {
    settingsAudioDevice.askPermission()
  }
})

onAfterMessageComposed(async () => {
})

watch([activeProvider, activeModel], async () => {
  if (activeProvider.value && activeModel.value) {
    await discoverToolsCompatibility(activeModel.value, await providersStore.getProviderInstance<ChatProvider>(activeProvider.value), [])
  }
})

onUnmounted(() => {
  teardownAnalyzer()
})

onMounted(() => {
  screenSafeArea.update()
})
</script>

<template>
  <div fixed bottom-0 w-full flex flex-col>
    <BackgroundDialogPicker v-model="backgroundDialogOpen" />
    <KeepAlive>
      <Transition name="fade">
        <ChatHistory
          v-if="!stageViewControlsEnabled"
          variant="mobile"
          :messages="historyMessages"
          :sending="sending"
          :streaming-message="streamingMessage"
          max-w="[calc(100%-3.5rem)]"
          w-full self-start pb-3 pl-3
          class="chat-history"
          :class="[
            'relative z-20',
          ]"
        />
      </Transition>
    </KeepAlive>
    <div relative w-full self-end>
      <div top="50%" translate-y="[-50%]" fixed z-15 px-3>
        <ViewControlInputs ref="viewControlsInputs" :mode="viewControlsActiveMode" />
      </div>
      <div translate-y="[-100%]" absolute right-0 w-full px-3 pb-3 font-sans>
        <div flex="~ col" w-full gap-1>
          <ActionAbout />
          <HearingConfigDialog
            v-model:show="hearingDialogOpen"
            v-model:enabled="enabled"
            v-model:selected-audio-input="selectedAudioInput"
            :audio-inputs="audioInputs"
            :volume-level="volumeLevel"
            :granted="true"
          >
            <button
              border="2 solid neutral-100/60 dark:neutral-800/30"
              bg="neutral-50/70 dark:neutral-800/70"
              w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
              title="Hearing"
            >
              <Transition name="fade" mode="out-in">
                <IndicatorMicVolume v-if="enabled" size-5 color-class="text-neutral-500 dark:text-neutral-400" />
                <div v-else i-solar:microphone-3-outline size-5 text="neutral-500 dark:neutral-400" />
              </Transition>
            </button>
          </HearingConfigDialog>
          <button border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Theme" @click="toggleDark()">
            <Transition name="fade" mode="out-in">
              <div v-if="isDark" i-solar:moon-outline size-5 text="neutral-500 dark:neutral-400" />
              <div v-else i-solar:sun-2-outline size-5 text="neutral-500 dark:neutral-400" />
            </Transition>
          </button>
          <button border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Background" @click="backgroundDialogOpen = true">
            <div i-solar:gallery-wide-bold-duotone size-5 text="neutral-500 dark:neutral-400" />
          </button>
          <!-- <button border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Language">
            <div i-solar:earth-outline size-5 text="neutral-500 dark:neutral-400" />
          </button> -->
          <RouterLink to="/settings" border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Settings">
            <div i-solar:settings-outline size-5 text="neutral-500 dark:neutral-400" />
          </RouterLink>
          <!-- <button border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Model">
            <div i-solar:face-scan-circle-outline size-5 text="neutral-500 dark:neutral-400" />
          </button> -->
          <ActionViewControls v-model="viewControlsActiveMode" @reset="() => viewControlsInputsRef?.resetOnMode()" />
          <button
            border="2 solid neutral-100/60 dark:neutral-800/30"
            bg="neutral-50/70 dark:neutral-800/70"
            w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
            title="Cleanup Messages"
            @click="cleanupMessages()"
          >
            <div class="i-solar:trash-bin-2-bold-duotone" />
          </button>
        </div>
      </div>
      <div bg="white dark:neutral-800" max-h-100dvh max-w-100dvw w-full flex gap-1 overflow-auto px-3 pt-2 :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 12)}px` }">
        <BasicTextarea
          v-model="messageInput"
          :placeholder="t('stage.message')"
          border="solid 2 neutral-200/60 dark:neutral-700/60"
          text="neutral-500 hover:neutral-600 dark:neutral-100 dark:hover:neutral-200 placeholder:neutral-400 placeholder:hover:neutral-500 placeholder:dark:neutral-300 placeholder:dark:hover:neutral-400"
          bg="neutral-100/80 dark:neutral-950/80"
          max-h="[10lh]" min-h="[calc(1lh+4px+4px)]"
          w-full resize-none overflow-y-scroll rounded="[1lh]" px-4 py-0.5 outline-none backdrop-blur-md scrollbar-none
          transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
          :class="[themeColorsHueDynamic ? 'transition-colors-none placeholder:transition-colors-none' : '']"
          default-height="1lh"
          @submit="handleSubmit"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
        />
        <button
          v-if="messageInput.trim() || isComposing"
          w="[calc(1lh+4px+4px)]" h="[calc(1lh+4px+4px)]" aspect-square flex items-center self-end justify-center rounded-full outline-none backdrop-blur-md
          text="neutral-500 hover:neutral-600 dark:neutral-900 dark:hover:neutral-800"
          bg="primary-50/80 dark:neutral-100/80 hover:neutral-50"
          transition="all duration-250 ease-in-out"
          @click="handleSend"
        >
          <div i-solar:arrow-up-outline />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes scan {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}

.animate-scan {
  animation: scan 2s infinite linear;
}

/*
DO NOT ATTEMPT TO USE backdrop-filter TOGETHER WITH mask-image.

html - Why doesn't blur backdrop-filter work together with mask-image? - Stack Overflow
https://stackoverflow.com/questions/72780266/why-doesnt-blur-backdrop-filter-work-together-with-mask-image
*/
.chat-history {
  --gradient: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 20%);
  -webkit-mask-image: var(--gradient);
  mask-image: var(--gradient);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: bottom;
  mask-position: bottom;
  max-height: 35dvh;
}
</style>
