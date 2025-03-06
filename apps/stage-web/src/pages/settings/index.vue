<script setup lang="ts">
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import IconItem from '../../components/Menu/IconItem.vue'

const { t } = useI18n()
const { language, disableTransitions } = storeToRefs(useSettings())
const dark = useDark()

function handleLanguageChange(event: Event) {
  const target = event.target as HTMLSelectElement
  language.value = target.value
}
</script>

<template>
  <div>
    <h1 text-3xl>
      Settings
    </h1>
  </div>
  <div flex="~ col gap-4">
    <div flex="~ col gap-4">
      <IconItem title="Modules" description="Thinking, vision, speech synthesis, gaming, etc." icon="i-lucide:blocks" to="/settings/modules" />
      <IconItem title="Models" description="Live2D, VRM, etc." icon="i-lucide:person-standing" to="/settings/models" />
      <IconItem title="Providers" description="LLMs, speech providers, etc." icon="i-lucide:brain" to="/settings/providers" />
      <IconItem title="Themes" description="Customize your stage!" icon="i-lucide:paintbrush" to="/settings/themes" />
    </div>
    <div>
      <h2 text-2xl>
        General
      </h2>
    </div>
    <div flex="~ col gap-4">
      <!-- Language Setting -->
      <div
        grid="~ cols-[150px_1fr]"
        bg="neutral-100 dark:neutral-800"
        hover="bg-neutral-200 dark:bg-neutral-700"
        transition="all ease-in-out duration-250"
        items-center gap-1.5 rounded-lg px-4 py-3
      >
        <div text="sm">
          <span>{{ t('settings.language.title') }}</span>
        </div>
        <div flex="~ row" w-full justify-end>
          <select
            class="w-32"
            bg="transparent"
            text="sm right neutral-800 dark:neutral-100"
            transition="all ease-in-out duration-250"
            outline="none"
            @change="handleLanguageChange"
          >
            <option value="en-US">
              {{ t('settings.language.english') }}
            </option>
            <option value="zh-CN">
              {{ t('settings.language.chinese') }}
            </option>
          </select>
        </div>
      </div>
      <!-- Theme Setting -->
      <label
        bg="neutral-100 dark:neutral-800"
        hover="bg-neutral-200 dark:bg-neutral-700"
        transition="all ease-in-out duration-250"
        w-full flex cursor-pointer rounded-lg px-4 py-3
      >
        <input
          v-model="dark"
          text="neutral-800 dark:neutral-100"
          :checked="dark"
          :aria-checked="dark"
          type="checkbox"
          hidden appearance-none outline-none
        >
        <div flex="~ row" w-full items-center gap-1.5>
          <div text="sm" w-full flex-1>
            <span>{{ t('settings.theme') }}</span>
          </div>
          <div select-none>
            <Transition name="slide-away" mode="out-in">
              <div
                v-if="dark"
                i-solar:moon-stars-bold-duotone
                transition="all ease-in-out duration-250"
              />
              <div
                v-else
                i-solar:sun-fog-bold-duotone
                transition="all ease-in-out duration-250"
              />
            </Transition>
          </div>
        </div>
      </label>
      <!-- Developer Settings -->
      <label
        bg="neutral-100 dark:neutral-800"
        hover="bg-neutral-200 dark:bg-neutral-700"
        transition="all ease-in-out duration-250"
        w-full flex cursor-pointer rounded-lg px-4 py-3
      >
        <input
          v-model="disableTransitions"
          text="neutral-800 dark:neutral-100"
          :checked="disableTransitions"
          :aria-checked="disableTransitions"
          type="checkbox"
          hidden appearance-none outline-none
        >
        <div flex="~ row" w-full items-center gap-1.5>
          <div text="sm" w-full flex-1>
            <span>Disable Transitions (for debugging)</span>
          </div>
          <div select-none>
            <Transition name="slide-away" mode="out-in">
              <div
                v-if="disableTransitions"
                i-solar:moon-stars-bold-duotone
                transition="all ease-in-out duration-250"
              />
              <div
                v-else
                i-solar:sun-fog-bold-duotone
                transition="all ease-in-out duration-250"
              />
            </Transition>
          </div>
        </div>
      </label>
    </div>
    <div fixed bottom-0 right-0 text="neutral-100/50 dark:neutral-500/20">
      <div text="40" i-lucide:cog translate-x-10 translate-y-10 />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
