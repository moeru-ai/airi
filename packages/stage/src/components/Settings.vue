<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSettings } from '../stores/settings'

const { t } = useI18n()

const settings = useSettings()
const show = ref(false)
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
        <div select-none>2D</div>
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
        <div select-none>3D</div>
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
            <div i-carbon:settings text="text-zinc-900 dark:text-zinc-800 lg" />
          </div>
        </label>
      </div>
      <div
        v-if="show" w="120 <sm:[calc(100vw-16px)]" right="0" bg="zinc-100 dark:zinc-700"
        grid="~ cols-[140px_1fr]" absolute z-100 my-2 items-center gap-1.5 rounded-lg p-2
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
      </div>
    </div>
  </div>
</template>
