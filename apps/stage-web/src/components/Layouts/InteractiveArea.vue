<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/shared-providers'

import { HearingConfigDialog } from '@proj-airi/stage-ui/components'
import { useAudioAnalyzer } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea } from '@proj-airi/ui'
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatHistory from '../Widgets/ChatHistory.vue'
import IndicatorMicVolume from '../Widgets/IndicatorMicVolume.vue'

const messageInput = ref('')
const hearingDialogOpen = ref(false)
const isComposing = ref(false)

const providersStore = useProvidersStore()
const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
const { themeColorsHueDynamic } = storeToRefs(useSettings())

const { askPermission } = useSettingsAudioDevice()
const { enabled, selectedAudioInput, stream, audioInputs } = storeToRefs(useSettingsAudioDevice())
const { send, onAfterMessageComposed, discoverToolsCompatibility, cleanupMessages } = useChatStore()
const { messages } = storeToRefs(useChatStore())
const { audioContext } = useAudioContext()
const { t } = useI18n()

const isDark = useDark({ disableTransition: false })

// Legacy whisper pipeline removed; audio pipeline handled at page level

async function handleSend() {
  if (!messageInput.value.trim() || isComposing.value) {
    return
  }

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)

    await send(messageInput.value, {
      chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
      model: activeModel.value,
      providerConfig,
    })
  }
  catch (error) {
    messages.value.pop()
    messages.value.push({
      role: 'error',
      content: (error as Error).message,
    })
  }
}

// No inline VAD/whisper here; see pages/index.vue pipeline

watch(hearingDialogOpen, async (value) => {
  if (value) {
    await askPermission()
  }
})

watch([activeProvider, activeModel], async () => {
  if (activeProvider.value && activeModel.value) {
    await discoverToolsCompatibility(activeModel.value, await providersStore.getProviderInstance<ChatProvider>(activeProvider.value), [])
  }
})

onMounted(() => {})

onAfterMessageComposed(async () => {
  messageInput.value = ''
})

const { startAnalyzer, stopAnalyzer, volumeLevel } = useAudioAnalyzer()
let analyzerSource: MediaStreamAudioSourceNode | undefined

function teardownAnalyzer() {
  try { analyzerSource?.disconnect() }
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
</script>

<template>
  <div flex="col" items-center pt-4>
    <div h-full max-h="[85vh]" w-full py="4">
      <div
        flex="~ col"
        border="solid 4 primary-200/20 dark:primary-400/20"
        h-full w-full overflow-scroll rounded-xl
        bg="primary-50/50 dark:primary-950/70" backdrop-blur-md
      >
        <ChatHistory h-full flex-1 w="full" max-h="<md:[60%]" />
        <div h="<md:full" flex gap-2>
          <BasicTextarea
            v-model="messageInput"
            :placeholder="t('stage.message')"
            text="primary-500 hover:primary-600 dark:primary-300/50 dark:hover:primary-500 placeholder:primary-400 placeholder:hover:primary-500 placeholder:dark:primary-300/50 placeholder:dark:hover:primary-500"
            bg="primary-200/20 dark:primary-400/20"
            min-h="[100px]" max-h="[300px]" w-full
            rounded-t-xl p-4 font-medium
            outline-none transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
            :class="{
              'transition-colors-none placeholder:transition-colors-none': themeColorsHueDynamic,
            }"
            @submit="handleSend"
            @compositionstart="isComposing = true"
            @compositionend="isComposing = false"
          />

          <HearingConfigDialog
            v-model:show="hearingDialogOpen"
            :overlay-dim="true"
            :overlay-blur="true"
            :enabled="enabled"
            :audio-input-options="audioInputs"
            :selected-audio-input="selectedAudioInput"
            :has-devices="(audioInputs || []).length > 0"
            :volume-level="volumeLevel"
            @toggle-enabled="enabled = !enabled"
            @update:selected-audio-input="val => selectedAudioInput = val as string"
          >
            <button
              class="max-h-[10lh] min-h-[1lh]"
              bg="neutral-100 dark:neutral-800"
              text="lg neutral-500 dark:neutral-400"
              :class="{ 'ring-2 ring-primary-400/60 ring-offset-2 dark:ring-offset-neutral-900': enabled }"
              flex items-center justify-center rounded-md p-2 outline-none
              transition="colors duration-200, transform duration-100" active:scale-95
              :title="t('settings.hearing.title')"
            >
              <Transition name="fade" mode="out-in">
                <IndicatorMicVolume v-if="enabled" />
                <div v-else class="i-ph:microphone-slash" />
              </Transition>
            </button>
          </HearingConfigDialog>
        </div>
      </div>
    </div>

    <div absolute bottom--8 right-0 flex gap-2>
      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        hover:text="red-500 dark:red-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        @click="cleanupMessages"
      >
        <div class="i-solar:trash-bin-2-bold-duotone" />
      </button>

      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        @click="isDark = !isDark"
      >
        <Transition name="fade" mode="out-in">
          <div v-if="isDark" i-solar:moon-bold />
          <div v-else i-solar:sun-2-bold />
        </Transition>
      </button>
    </div>
  </div>
</template>
