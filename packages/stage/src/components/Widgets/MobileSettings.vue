<script setup lang="ts">
import type { Voice } from '../../constants/elevenlabs'
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { voiceList } from '../../constants/elevenlabs'
import { useLLM } from '../../stores/llm'
import { useSettings } from '../../stores/settings'

const { t, locale } = useI18n()

const settings = useSettings()
const dark = useDark({ disableTransition: false })
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
</script>

<template>
  <div>
    <h2 text="slate-800/80 dark:slate-200/80 xl" font-bold>
      Settings
    </h2>
    <div>
      <div
        grid="~ cols-[140px_1fr]" my-2 items-center gap-1.5 rounded-lg
        bg="[#fff6fc] dark:[#2c2529]" px-2 py-1 text="pink-400"
      >
        <div text="sm pink-500">
          <span>{{ t('settings.openai-base-url.label') }}</span>
        </div>
        <div flex="~ row" w-full text="sm">
          <input
            v-model="settings.openAiApiBaseURL"
            type="text"
            :placeholder="t('settings.openai-base-url.placeholder_mobile')"
            h-8 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          >
        </div>
        <div text="sm pink-500">
          <span>{{ t('settings.openai-api-key.label') }}</span>
        </div>
        <div flex="~ row" w-full text="sm">
          <input
            v-model="settings.openAiApiKey"
            type="text"
            :placeholder="t('settings.openai-api-key.placeholder_mobile')"
            h-8 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          >
        </div>
        <div text="sm pink-500">
          <span>{{ t('settings.elevenlabs-api-key.label') }}</span>
        </div>
        <div flex="~ row" w-full text="sm">
          <input
            v-model="settings.elevenLabsApiKey"
            type="text"
            :placeholder="t('settings.elevenlabs-api-key.placeholder_mobile')"
            h-8 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          >
        </div>
        <div text="sm pink-500">
          <span>{{ t('settings.language') }}</span>
        </div>
        <div flex="~ row" w-full text="sm">
          <select
            v-model="settings.language"
            h-8 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          >
            <option value="en-US">
              English
            </option>
            <option value="zh-CN">
              简体中文
            </option>
          </select>
        </div>
        <div text="sm pink-500">
          <span>{{ t('settings.models') }}</span>
        </div>
        <div flex="~ row" w-full text="sm">
          <select
            h-8 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
            @change="handleModelChange"
          >
            <option disabled class="bg-white dark:bg-zinc-800">
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
        <div text="sm pink-500">
          <span>{{ t('settings.voices') }}</span>
        </div>
        <div flex="~ row" w-full text="sm">
          <select
            h-8 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
            @change="handleVoiceChange"
          >
            <option disabled class="bg-white dark:bg-zinc-800">
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
    <h2 text="slate-800/80 dark:slate-200/80 xl" font-bold>
      View
    </h2>
    <div>
      <div
        grid="~ cols-[140px_1fr]" my-2 items-center gap-1.5 rounded-lg
        bg="[#fff6fc] dark:[#2c2529]" px-2 py-1 text="pink-400"
      >
        <div text="sm pink-500">
          <span>Viewer</span>
        </div>
        <select
          h-8 w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          @change="handleViewChange"
        >
          <option value="2d">
            2D
          </option>
          <option value="3d">
            3D
          </option>
        </select>
        <div text="sm pink-500">
          <span>Theme</span>
        </div>
        <label h-8 flex cursor-pointer items-center justify-end>
          <input
            v-model="dark"
            :checked="dark"
            :aria-checked="dark"
            name="stageView"
            type="checkbox"
            hidden appearance-none outline-none
          >
          <div select-none>
            <Transition name="slide-away" mode="out-in">
              <div v-if="dark" i-solar:sun-fog-bold-duotone text="lg hover:pink-600 dark:hover:pink-300" transition="all ease-in-out duration-250" />
              <div v-else i-solar:moon-stars-bold-duotone text="lg hover:pink-600 dark:hover:pink-300" transition="all ease-in-out duration-250" />
            </Transition>
          </div>
        </label>
      </div>
    </div>
  </div>
</template>
