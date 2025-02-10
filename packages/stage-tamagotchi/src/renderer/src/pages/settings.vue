<script setup lang="ts">
import type { Voice } from '@proj-airi/stage-ui/constants'

import { voiceList } from '@proj-airi/stage-ui/constants'
import { useLLM, useSettings } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

const settings = useSettings()
const supportedModels = ref<{ id: string, name?: string }[]>([])
const { models } = useLLM()
const { openAiModel, openAiApiBaseURL, openAiApiKey, elevenlabsVoiceEnglish, elevenlabsVoiceJapanese } = storeToRefs(settings)

function handleModelChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const found = supportedModels.value.find(m => m.id === target.value)
  if (!found) {
    openAiModel.value = undefined
    return
  }

  openAiModel.value = found
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
      elevenlabsVoiceEnglish.value = value
      break
    case 'zh':
    case 'zh-CN':
    case 'zh-TW':
    case 'zh-HK':
      elevenlabsVoiceEnglish.value = value
      break
    case 'jp':
    case 'jp-JP':
      elevenlabsVoiceJapanese.value = value
      break
  }
}

watch([openAiApiBaseURL, openAiApiKey], async ([baseUrl, apiKey]) => {
  if (!baseUrl || !apiKey) {
    supportedModels.value = []
    return
  }

  supportedModels.value = await models(baseUrl, apiKey)
})

onMounted(async () => {
  if (!openAiApiBaseURL.value || !openAiApiKey.value)
    return

  supportedModels.value = await models(openAiApiBaseURL.value, openAiApiKey.value)
})

function handleQuit() {
  window.electron.ipcRenderer.send('quit')
}
</script>

<template>
  <div m-4>
    <h2 text="slate-800/80" font-bold>
      Settings
    </h2>
    <div>
      <div
        grid="~ cols-[140px_1fr]" my-2 items-center gap-1.5 rounded-lg
        bg="[#fff6fc]" px-2 py-1 text="pink-400"
      >
        <div text="xs pink-500">
          <span>{{ t('settings.openai-base-url.label') }}</span>
        </div>
        <div flex="~ row" w-full text="xs">
          <input
            v-model="settings.openAiApiBaseURL"
            type="text"
            :placeholder="t('settings.openai-base-url.placeholder_mobile')"
            h-6 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          >
        </div>
        <div text="xs pink-500">
          <span>{{ t('settings.openai-api-key.label') }}</span>
        </div>
        <div flex="~ row" w-full text="xs">
          <input
            v-model="settings.openAiApiKey"
            type="text"
            :placeholder="t('settings.openai-api-key.placeholder_mobile')"
            h-6 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          >
        </div>
        <div text="xs pink-500">
          <span>{{ t('settings.elevenlabs-api-key.label') }}</span>
        </div>
        <div flex="~ row" w-full text="xs">
          <input
            v-model="settings.elevenLabsApiKey"
            type="text"
            :placeholder="t('settings.elevenlabs-api-key.placeholder_mobile')"
            h-6 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          >
        </div>
        <div text="xs pink-500">
          <span>{{ t('settings.language.title') }}</span>
        </div>
        <div flex="~ row" w-full text="xs">
          <select
            v-model="settings.language"
            h-6 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          >
            <option value="en-US">
              English
            </option>
            <option value="zh-CN">
              简体中文
            </option>
          </select>
        </div>
        <div text="xs pink-500">
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
            <option v-if="settings.openAiModel" :value="settings.openAiModel.id">
              {{ 'name' in settings.openAiModel ? `${settings.openAiModel.name} (${settings.openAiModel.id})` : settings.openAiModel.id }}
            </option>
            <option v-for="m in supportedModels" :key="m.id" :value="m.id">
              {{ 'name' in m ? `${m.name} (${m.id})` : m.id }}
            </option>
          </select>
        </div>
        <div text="xs pink-500">
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
            <option v-if="['en', 'en-US'].indexOf(locale) !== -1 && elevenlabsVoiceEnglish" :value="elevenlabsVoiceEnglish">
              {{ elevenlabsVoiceEnglish }}
            </option>
            <!-- TODO -->
            <option v-if="['zh', 'zh-CN', 'zh-TW', 'zh-HK'].indexOf(locale) !== -1 && elevenlabsVoiceEnglish" :value="elevenlabsVoiceEnglish">
              {{ elevenlabsVoiceEnglish }}
            </option>
            <option v-if="['jp', 'jp-JP'].indexOf(locale) !== -1 && elevenlabsVoiceJapanese" :value="elevenlabsVoiceJapanese">
              {{ elevenlabsVoiceJapanese }}
            </option>
            <option v-for="(m, index) in voiceList[locale]" :key="index" :value="m">
              {{ m }}
            </option>
          </select>
        </div>
      </div>
    </div>
    <h2 text="slate-800/80" font-bold>
      View
    </h2>
    <div>
      <div
        grid="~ cols-[140px_1fr]" my-2 items-center gap-1.5 rounded-lg
        bg="[#fff6fc]" px-2 py-1 text="pink-400"
      >
        <div text="xs pink-500">
          <span>Viewer</span>
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
      Other
    </h2>
    <div pb-2>
      <div
        grid="~ cols-[140px_1fr]" my-2 items-center gap-1.5 rounded-lg
        bg="[#fff6fc]" p-2 text="pink-400" @click="handleQuit"
      >
        <div text="xs pink-500">
          <span>
            Quit
          </span>
        </div>
        <div text="sm pink-500" text-right>
          <div i-solar:exit-bold-duotone ml-auto />
        </div>
      </div>
    </div>
  </div>
</template>
