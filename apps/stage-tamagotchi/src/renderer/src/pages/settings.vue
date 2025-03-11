<script setup lang="ts">
import type { Voice } from '@proj-airi/stage-ui/constants'

import { voiceMap } from '@proj-airi/stage-ui/constants'
import { useConsciousnessStore, useLLM, useProvidersStore, useSettings, useSpeechStore } from '@proj-airi/stage-ui/stores'
import { useShortcutsStore } from '@renderer/stores/shortcuts'
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

const settings = useSettings()
const { shortcuts } = storeToRefs(useShortcutsStore())
const supportedModels = ref<{ id: string, name?: string }[]>([])
const { models } = useLLM()
const { language } = storeToRefs(settings)
const consciousnessStore = useConsciousnessStore()
const speechStore = useSpeechStore()
const providersStore = useProvidersStore()

const { activeModel } = storeToRefs(consciousnessStore)
const { voiceId } = storeToRefs(speechStore)
const { providers } = storeToRefs(providersStore)

const apiKey = ref<string>(providers.value['openrouter-ai']?.apiKey as string || '')
const baseUrl = ref<string>(providers.value['openrouter-ai']?.baseUrl as string || '')
const elevenLabsApiKey = ref<string>(providers.value.elevenlabs?.apiKey as string || '')

const recordingFor = ref<string | null>(null)
const recordingKeys = ref<{
  modifier: string[]
  key: string
}>({
  modifier: [],
  key: '',
})

function handleModelChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const found = supportedModels.value.find(m => m.id === target.value)
  if (!found) {
    activeModel.value = ''
    return
  }

  activeModel.value = found.id
}

function handleViewChange(event: Event) {
  const target = event.target as HTMLSelectElement
  settings.stageView = target.value
}

function handleVoiceChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value as Voice
  switch (locale.value) {
    case 'en':
    case 'en-US':
      voiceId.value = value
      break
    case 'zh':
    case 'zh-CN':
    case 'zh-TW':
    case 'zh-HK':
      voiceId.value = value
      break
    case 'jp':
    case 'jp-JP':
      voiceId.value = value
      break
  }
}

watch([baseUrl, apiKey], async ([baseUrl, apiKey]) => {
  if (!baseUrl || !apiKey) {
    supportedModels.value = []
    return
  }

  supportedModels.value = await models(baseUrl, apiKey)
})

onMounted(async () => {
  if (!baseUrl.value || !apiKey.value)
    return

  supportedModels.value = await models(baseUrl.value, apiKey.value)
})

function handleQuit() {
  window.electron.ipcRenderer.send('quit')
}

// Add function to handle shortcut recording
function startRecording(shortcut: typeof shortcuts.value[0]) {
  recordingFor.value = shortcut.type
}

function isModifierKey(key: string) {
  return ['Shift', 'Control', 'Alt', 'Meta'].includes(key)
}

// Handle key combinations
useEventListener('keydown', (e) => {
  if (!recordingFor.value)
    return

  e.preventDefault()

  if (isModifierKey(e.key)) {
    if (recordingKeys.value.modifier.includes(e.key))
      return

    recordingKeys.value.modifier.push(e.key)

    return
  }

  if (recordingKeys.value.modifier.length === 0)
    return

  recordingKeys.value.key = e.key.toUpperCase()

  const shortcut = shortcuts.value.find(s => s.type === recordingFor.value)
  if (shortcut)
    shortcut.shortcut = `${recordingKeys.value.modifier.join('+')}+${recordingKeys.value.key}`

  recordingKeys.value = {
    modifier: [],
    key: '',
  }
  recordingFor.value = null
}, { passive: false })

// Add click outside handler to cancel recording
useEventListener('click', (e) => {
  if (recordingFor.value) {
    const target = e.target as HTMLElement
    if (!target.closest('.shortcut-item')) {
      recordingFor.value = null
    }
  }
})

const pressKeysMessage = computed(() => {
  if (recordingKeys.value.modifier.length === 0)
    return t('settings.press_keys')

  return `${t('settings.press_keys')}: ${recordingKeys.value.modifier.join('+')}+${recordingKeys.value.key}`
})

function isConflict(shortcut: typeof shortcuts.value[0]) {
  return shortcuts.value.some(s => s.type !== shortcut.type && s.shortcut === shortcut.shortcut)
}
</script>

<template>
  <div m-4>
    <h2 text="slate-800/80" font-bold>
      Settings
    </h2>
    <div>
      <div grid="~ cols-[140px_1fr]" my-2 items-center gap-1.5 rounded-lg bg="[#fff6fc]" px-2 py-1 text="primary-400">
        <div text="xs primary-500">
          <span>{{ t('settings.openai-base-url.label') }}</span>
        </div>
        <div flex="~ row" w-full text="xs">
          <input
            v-model="baseUrl" type="text" :placeholder="t('settings.openai-base-url.placeholder_mobile')" h-6
            w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          >
        </div>
        <div text="xs primary-500">
          <span>{{ t('settings.openai-api-key.label') }}</span>
        </div>
        <div flex="~ row" w-full text="xs">
          <input
            v-model="apiKey" type="text" :placeholder="t('settings.openai-api-key.placeholder_mobile')" h-6 w-full
            rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          >
        </div>
        <div text="xs primary-500">
          <span>{{ t('settings.elevenlabs-api-key.label') }}</span>
        </div>
        <div flex="~ row" w-full text="xs">
          <input
            v-model="elevenLabsApiKey" type="text"
            :placeholder="t('settings.elevenlabs-api-key.placeholder_mobile')" h-6 w-full rounded-md bg-transparent px-2
            py-1 text-right font-mono outline-none
          >
        </div>
        <div text="xs primary-500">
          <span>{{ t('settings.language.title') }}</span>
        </div>
        <div flex="~ row" w-full text="xs">
          <select v-model="language" h-6 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none>
            <option value="en-US">
              English
            </option>
            <option value="zh-CN">
              简体中文
            </option>
          </select>
        </div>
        <div text="xs primary-500">
          <span>{{ t('settings.models') }}</span>
        </div>
        <div flex="~ row" w-full text="xs">
          <select
            h-6 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
            @change="handleModelChange"
          >
            <option disabled class="bg-white">
              {{ t('stage.select-a-model') }}
            </option>
            <option v-if="providersStore.getModelsForProvider('openrouter-ai')" :value="activeModel">
              {{ activeModel }}
            </option>
            <option v-for="m in supportedModels" :key="m.id" :value="m.id">
              {{ 'name' in m ? `${m.name} (${m.id})` : m.id }}
            </option>
          </select>
        </div>
        <div text="xs primary-500">
          <span>{{ t('settings.voices') }}</span>
        </div>
        <div flex="~ row" w-full text="xs">
          <select
            h-6 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
            @change="handleVoiceChange"
          >
            <option disabled class="bg-white">
              {{ t('stage.select-a-voice') }}
            </option>
            <option v-for="(voice, index) of Object.entries(voiceMap)" :key="index" :value="voice[1]">
              {{ voice[0] }}
            </option>
          </select>
        </div>
      </div>
    </div>
    <h2 text="slate-800/80" font-bold>
      View
    </h2>
    <div>
      <div grid="~ cols-[140px_1fr]" my-2 items-center gap-1.5 rounded-lg bg="[#fff6fc]" px-2 py-1 text="primary-400">
        <div text="xs primary-500">
          <span>{{ t('settings.viewer') }}</span>
        </div>
        <select
          h-6 w-full rounded-md bg-transparent px-2 py-1 text-right text-xs font-mono outline-none
          @change="handleViewChange"
        >
          <option value="2d">
            2D
          </option>
          <option value="3d">
            3D
          </option>
        </select>
      </div>
    </div>
    <h2 text="slate-800/80" font-bold>
      {{ t('settings.shortcuts.title') }}
    </h2>
    <div pb-2>
      <div grid="~ cols-[140px_1fr]" my-2 items-center gap-1.5 rounded-lg bg="[#fff6fc]" p-2 text="primary-400">
        <template v-for="shortcut in shortcuts" :key="shortcut.type">
          <span text="xs primary-500">
            {{ t(shortcut.name) }}
          </span>
          <div
            class="shortcut-item flex items-center justify-end gap-x-2 px-2 py-0.5"
            :class="{ recording: recordingFor === shortcut.type }" text="xs primary-500" cursor-pointer
            @click="startRecording(shortcut)"
          >
            <div v-if="recordingFor === shortcut.type" class="pointer-events-none animate-flash animate-count-infinite">
              {{ pressKeysMessage }}
            </div>
            <div v-else class="pointer-events-none">
              {{ shortcut.shortcut }}
            </div>
            <div v-if="isConflict(shortcut)" text="xs primary-500" i-solar:danger-square-bold w-4 />
          </div>
        </template>
      </div>
    </div>
    <h2 text="slate-800/80" font-bold>
      {{ t('settings.other') }}
    </h2>
    <div pb-2>
      <div
        grid="~ cols-[140px_1fr]" my-2 items-center gap-1.5 rounded-lg bg="[#fff6fc]" p-2 text="primary-400"
        @click="handleQuit"
      >
        <div text="xs primary-500">
          <span>
            {{ t('settings.quit') }}
          </span>
        </div>
        <div text="sm primary-500" text-right>
          <div i-solar:exit-bold-duotone ml-auto />
        </div>
      </div>
    </div>
  </div>
</template>
