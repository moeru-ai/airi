<script setup lang="ts">
import type { Voice } from '@proj-airi/stage-ui/constants'
import { TransitionVertical } from '@proj-airi/stage-ui/components'
import { voiceList } from '@proj-airi/stage-ui/constants'
import { useLLM, useSettings } from '@proj-airi/stage-ui/stores'

import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

const settings = useSettings()
const show = ref(false)
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
  <div flex="~" gap-2>
    <fieldset
      flex="~ row"
      bg="zinc-100 dark:zinc-700"
      text="sm zinc-400 dark:zinc-500"
      appearance-none gap-1 rounded-lg rounded-md border-none p-1
    >
      <label
        h-fit cursor-pointer
        :class="[settings.stageView === '2d' ? 'bg-zinc-300 text-zinc-900 dark:bg-zinc-200 dark:text-zinc-800' : '']"
        rounded-md px-4 py-2
      >
        <input
          v-model="settings.stageView"
          :checked="settings.stageView === '2d'"
          :aria-checked="settings.stageView === '2d'"
          name="settings.stageView"
          type="radio"
          role="radio"
          value="2d"
          hidden appearance-none outline-none
        >
        <div select-none :class="[settings.stageView === '2d' ? 'font-semibold' : '']">
          2D
        </div>
      </label>
      <label
        h-fit cursor-pointer
        :class="[settings.stageView === '3d' ? 'bg-zinc-300 text-zinc-900 dark:bg-zinc-200 dark:text-zinc-800' : '']"
        rounded-md px-4 py-2
      >
        <input
          v-model="settings.stageView"
          :checked="settings.stageView === '3d'"
          :aria-checked="settings.stageView === '3d'"
          name="stageView"
          type="radio"
          role="radio"
          value="3d"
          hidden appearance-none outline-none
        >
        <div select-none :class="[settings.stageView === '3d' ? 'font-semibold' : '']">
          3D
        </div>
      </label>
    </fieldset>
    <div relative>
      <div
        flex="~ row"
        bg="zinc-100 dark:zinc-700"
        text="sm zinc-400 dark:zinc-500"
        h-fit w-fit appearance-none gap-1 rounded-lg rounded-md border-none p-1
      >
        <label
          h-fit cursor-pointer
          :class="[show ? 'bg-zinc-300 text-zinc-900 dark:bg-zinc-200 dark:text-zinc-800' : '']"
          transition="all ease-in-out duration-500"
          rounded-md px-2 py-2
        >
          <input
            v-model="show"
            :checked="show"
            :aria-checked="show"
            name="stageView"
            type="checkbox"
            hidden appearance-none outline-none
          >
          <div select-none>
            <div i-solar:settings-minimalistic-bold-duotone text="text-zinc-900 dark:text-zinc-800 lg" />
          </div>
        </label>
      </div>
      <TransitionVertical>
        <div
          v-if="show" w="120 <sm:[calc(100vw-16px)]" right="0" bg="zinc-100 dark:zinc-700"
          grid="~ cols-[140px_1fr]" absolute z-100 my-2 items-center gap-1.5 rounded-lg px-3 py-2
        >
          <div text-sm>
            <span>{{ t('settings.openai-base-url.label') }}</span>
          </div>
          <div flex="~ row" w-full text="sm">
            <input
              v-model="settings.openAiApiBaseURL"
              type="text"
              :placeholder="t('settings.openai-base-url.placeholder')"
              bg="zinc-200 dark:zinc-800/50" w-full rounded-md px-2 py-1 font-mono outline-none
            >
          </div>
          <div text-sm>
            <span>{{ t('settings.openai-api-key.label') }}</span>
          </div>
          <div flex="~ row" w-full text="sm">
            <input
              v-model="settings.openAiApiKey"
              type="text"
              :placeholder="t('settings.openai-api-key.placeholder')"
              bg="zinc-200 dark:zinc-800/50" w-full rounded-md px-2 py-1 font-mono outline-none
            >
          </div>
          <div text-sm>
            <span>{{ t('settings.elevenlabs-api-key.label') }}</span>
          </div>
          <div flex="~ row" w-full text="sm">
            <input
              v-model="settings.elevenLabsApiKey"
              type="text"
              :placeholder="t('settings.elevenlabs-api-key.placeholder')"
              bg="zinc-200 dark:zinc-800/50" w-full rounded-md px-2 py-1 font-mono outline-none
            >
          </div>
          <div text-sm>
            <span>{{ t('settings.language') }}</span>
          </div>
          <div flex="~ row" w-full text="sm">
            <select
              v-model="settings.language" bg="zinc-200 dark:zinc-800/50" w-full rounded-md px-2 py-1 font-mono
              outline-none
            >
              <option value="en-US">
                English
              </option>
              <option value="zh-CN">
                简体中文
              </option>
            </select>
          </div>
          <div text-sm>
            <span>{{ t('settings.models') }}</span>
          </div>
          <div flex="~ row" w-full text="sm">
            <select
              bg="zinc-200 dark:zinc-800/50" w-full rounded-md px-2 py-1 font-mono
              outline-none
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
          <div text-sm>
            <span>{{ t('settings.voices') }}</span>
          </div>
          <div flex="~ row" w-full text="sm">
            <select
              bg="zinc-200 dark:zinc-800/50" w-full rounded-md px-2 py-1 font-mono
              outline-none
              @change="handleVoiceChange"
            >
              <option disabled class="bg-white dark:bg-zinc-800">
                {{ t('stage.select-a-voice') }}
              </option>
              <option v-if="['en', 'en-US'].indexOf(locale) !== -1 && elevenlabsVoiceEnglish" :value="elevenlabsVoiceEnglish">
                {{ elevenlabsVoiceEnglish }}
              </option>
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
      </TransitionVertical>
    </div>
    <div>
      <div
        flex="~ row"
        bg="zinc-100 dark:zinc-700"
        text="sm zinc-400 dark:zinc-500"
        h-fit w-fit appearance-none gap-1 rounded-lg rounded-md border-none p-1
      >
        <label
          h-fit cursor-pointer
          rounded-md px-2 py-2
        >
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
              <div v-if="dark" i-solar:sun-fog-bold-duotone text="lg hover:zinc-600 dark:hover:zinc-300" transition="all ease-in-out duration-250" />
              <div v-else i-solar:moon-stars-bold-duotone text="lg hover:zinc-600 dark:hover:zinc-300" transition="all ease-in-out duration-250" />
            </Transition>
          </div>
        </label>
      </div>
    </div>
  </div>
</template>
