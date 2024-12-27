<script setup lang="ts">
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useLLM } from '../../stores/llm'
import { useSettings } from '../../stores/settings'

const { t } = useI18n()

const settings = useSettings()
const dark = useDark({ disableTransition: false })
const supportedModels = ref<{ id: string, name?: string }[]>([])
const { models } = useLLM()
const { openAiModel, openAiApiBaseURL, openAiApiKey } = storeToRefs(settings)

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
    <div flex="~" gap-2>
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
            :placeholder="t('settings.openai-base-url.placeholder')"
            w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          >
        </div>
        <div text="sm pink-500">
          <span>{{ t('settings.openai-api-key.label') }}</span>
        </div>
        <div flex="~ row" w-full text="sm">
          <input
            v-model="settings.openAiApiKey"
            type="text"
            :placeholder="t('settings.openai-api-key.placeholder')"
            w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          >
        </div>
        <div text="sm pink-500">
          <span>{{ t('settings.elevenlabs-api-key.label') }}</span>
        </div>
        <div flex="~ row" w-full text="sm">
          <input
            v-model="settings.elevenLabsApiKey"
            type="text"
            :placeholder="t('settings.elevenlabs-api-key.placeholder')"
            w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
          >
        </div>
        <div text="sm pink-500">
          <span>{{ t('settings.language') }}</span>
        </div>
        <div flex="~ row" w-full text="sm">
          <select
            v-model="settings.language"
            w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
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
            w-full rounded-md bg-transparent px-2 py-1 font-mono outline-none
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
          <span>Theme</span>
        </div>
        <label
          h-fit cursor-pointer rounded-md px-2 py-2
        >
          <select
            w-full rounded-md bg-transparent px-2 py-1 text-right font-mono outline-none
            @change="handleViewChange"
          >
            <option value="2d">
              2D
            </option>
            <option value="3d">
              3D
            </option>
          </select>
        </label>
        <div text="sm pink-500">
          <span>Theme</span>
        </div>
        <label
          h-fit cursor-pointer rounded-md px-2 py-2
        >
          <input
            v-model="dark"
            :checked="dark"
            :aria-checked="dark"
            name="stageView"
            type="checkbox"
            hidden appearance-none outline-none
          >
          <div flex select-none justify-end>
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
