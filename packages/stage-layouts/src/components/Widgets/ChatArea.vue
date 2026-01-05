<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { useAudioAnalyzer } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import IndicatorMicVolume from './IndicatorMicVolume.vue'

const messageInput = ref('')
const hearingTooltipOpen = ref(false)
const isComposing = ref(false)

const providersStore = useProvidersStore()
const { activeProvider, activeModel, effectiveModel } = storeToRefs(useConsciousnessStore())
const { themeColorsHueDynamic } = storeToRefs(useSettings())

const { askPermission } = useSettingsAudioDevice()
const { enabled, selectedAudioInput, stream, audioInputs } = storeToRefs(useSettingsAudioDevice())
const chatStore = useChatStore()
const { send, onAfterMessageComposed, discoverToolsCompatibility } = chatStore
const { messages } = storeToRefs(useChatStore())
const { audioContext } = useAudioContext()
const { t } = useI18n()

async function handleSend() {
  if (!messageInput.value.trim() || isComposing.value) {
    return
  }

  const textToSend = messageInput.value
  messageInput.value = ''

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)

    await send(textToSend, {
      chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
      model: effectiveModel.value,
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

watch(hearingTooltipOpen, async (value) => {
  if (value) {
    await askPermission()
  }
})

watch([activeProvider, activeModel], async () => {
  if (activeProvider.value && effectiveModel.value) {
    await discoverToolsCompatibility(effectiveModel.value, await providersStore.getProviderInstance<ChatProvider>(activeProvider.value), [])
  }
})

onAfterMessageComposed(async () => {
})

const { startAnalyzer, stopAnalyzer, volumeLevel } = useAudioAnalyzer()
const normalizedVolume = computed(() => Math.min(1, Math.max(0, (volumeLevel.value ?? 0) / 100)))
let analyzerSource: MediaStreamAudioSourceNode | undefined

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
  if (!hearingTooltipOpen.value || !enabled.value || !stream.value)
    return
  if (audioContext.state === 'suspended')
    await audioContext.resume()
  const analyser = startAnalyzer(audioContext)
  if (!analyser)
    return
  analyzerSource = audioContext.createMediaStreamSource(stream.value)
  analyzerSource.connect(analyser)
}

watch([hearingTooltipOpen, enabled, stream], () => {
  setupAnalyzer()
}, { immediate: true })

onUnmounted(() => {
  teardownAnalyzer()
})
</script>

<template>
  <div h="<md:full" flex gap-2 class="ph-no-capture">
    <div
      :class="[
        'relative',
        'w-full',
        'bg-primary-200/20 dark:bg-primary-400/20',
      ]"
    >
      <BasicTextarea
        v-model="messageInput"
        :placeholder="t('stage.message')"
        text="primary-600 dark:primary-100  placeholder:primary-500 dark:placeholder:primary-200"
        bg="transparent"
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

      <div>
        <TooltipProvider :delay-duration="0" :skip-delay-duration="0">
          <TooltipRoot v-model:open="hearingTooltipOpen">
            <TooltipTrigger as-child>
              <button
                class="max-h-[10lh] min-h-[1lh]"
                text="lg neutral-500 dark:neutral-400"
                flex items-center justify-center rounded-md p-2 outline-none
                transition="colors duration-200, transform duration-100" active:scale-95
                :title="t('settings.hearing.title')"
              >
                <Transition name="fade" mode="out-in">
                  <IndicatorMicVolume v-if="enabled" />
                  <div v-else class="i-ph:microphone-slash" />
                </Transition>
              </button>
            </TooltipTrigger>
            <Transition name="fade">
              <TooltipContent
                side="top"
                :side-offset="8"
                :class="[
                  'w-72 max-w-[18rem] rounded-xl border border-neutral-200/60 bg-neutral-50/90 p-4',
                  'shadow-lg backdrop-blur-md dark:border-neutral-800/30 dark:bg-neutral-900/80',
                  'flex flex-col gap-3',
                ]"
              >
                <div class="flex flex-col items-center justify-center">
                  <div class="relative h-28 w-28 select-none">
                    <div
                      class="absolute left-1/2 top-1/2 h-20 w-20 rounded-full transition-all duration-150 -translate-x-1/2 -translate-y-1/2"
                      :style="{ transform: `translate(-50%, -50%) scale(${1 + normalizedVolume * 0.35})`, opacity: String(0.25 + normalizedVolume * 0.25) }"
                      :class="enabled ? 'bg-primary-500/15 dark:bg-primary-600/20' : 'bg-neutral-300/20 dark:bg-neutral-700/20'"
                    />
                    <div
                      class="absolute left-1/2 top-1/2 h-24 w-24 rounded-full transition-all duration-200 -translate-x-1/2 -translate-y-1/2"
                      :style="{ transform: `translate(-50%, -50%) scale(${1.2 + normalizedVolume * 0.55})`, opacity: String(0.15 + normalizedVolume * 0.2) }"
                      :class="enabled ? 'bg-primary-500/10 dark:bg-primary-600/15' : 'bg-neutral-300/10 dark:bg-neutral-700/10'"
                    />
                    <div
                      class="absolute left-1/2 top-1/2 h-28 w-28 rounded-full transition-all duration-300 -translate-x-1/2 -translate-y-1/2"
                      :style="{ transform: `translate(-50%, -50%) scale(${1.5 + normalizedVolume * 0.8})`, opacity: String(0.08 + normalizedVolume * 0.15) }"
                      :class="enabled ? 'bg-primary-500/5 dark:bg-primary-600/10' : 'bg-neutral-300/5 dark:bg-neutral-700/5'"
                    />
                    <button
                      class="absolute left-1/2 top-1/2 grid h-16 w-16 place-items-center rounded-full shadow-md outline-none transition-all duration-200 -translate-x-1/2 -translate-y-1/2"
                      :class="enabled
                        ? 'bg-primary-500 text-white hover:bg-primary-600 active:scale-95'
                        : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 active:scale-95 dark:bg-neutral-700 dark:text-neutral-200'"
                      @click="enabled = !enabled"
                    >
                      <div :class="enabled ? 'i-ph:microphone' : 'i-ph:microphone-slash'" class="h-6 w-6" />
                    </button>
                  </div>
                  <p class="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                    {{ enabled ? 'Microphone enabled' : 'Microphone disabled' }}
                  </p>
                </div>

                <FieldSelect
                  v-model="selectedAudioInput"
                  label="Input device"
                  description="Select the microphone you want to use."
                  :options="audioInputs.map(device => ({ label: device.label || 'Unknown Device', value: device.deviceId }))"
                  layout="vertical"
                  placeholder="Select microphone"
                />
              </TooltipContent>
            </Transition>
          </TooltipRoot>
        </TooltipProvider>
      </div>
    </div>
  </div>
</template>
