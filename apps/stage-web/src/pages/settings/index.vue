<script setup lang="ts">
import { IconItem } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const router = useRouter()
const { t } = useI18n()
const { language, disableTransitions } = storeToRefs(useSettings())
const dark = useDark()

function handleLanguageChange(event: Event) {
  const target = event.target as HTMLSelectElement
  language.value = target.value
}
</script>

<template>
  <div
    v-motion
    flex="~ row" items-center
    gap-2
    :initial="{ opacity: 0, x: 10 }"
    :enter="{ opacity: 1, x: 0 }"
    :duration="100"
  >
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 text-3xl>
      {{ t('settings.title') }}
    </h1>
  </div>
  <div flex="~ col gap-4">
    <div flex="~ col gap-4">
      <IconItem
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :title="t('settings.pages.modules.title')"
        :description="t('settings.pages.modules.description')"
        icon="i-lucide:blocks"
        to="/settings/modules"
      />
      <IconItem
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :delay="50"
        :title="t('settings.pages.models.title')"
        :description="t('settings.pages.models.description')"
        icon="i-lucide:person-standing"
        to="/settings/models"
      />
      <IconItem
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :delay="100"
        :title="t('settings.pages.memory.title')"
        :description="t('settings.pages.memory.description')"
        icon="i-lucide:sprout"
        to="/settings/memory"
      />
      <IconItem
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :delay="100"
        :title="t('settings.pages.providers.title')"
        :description="t('settings.pages.providers.description')"
        icon="i-lucide:brain"
        to="/settings/providers"
      />
      <IconItem
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :delay="150"
        :title="t('settings.pages.themes.title')"
        :description="t('settings.pages.themes.description')"
        icon="i-lucide:paintbrush"
        to="/settings/themes"
      />
    </div>
    <div
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250"
      :delay="150"
    >
      <h2 text-2xl>
        {{ t('settings.sections.section.general.title') }}
      </h2>
    </div>
    <div flex="~ col gap-4">
      <!-- Language Setting -->
      <div
        v-motion
        grid="~ cols-[150px_1fr]"
        bg="neutral-50 dark:neutral-800"
        hover="bg-neutral-200 dark:bg-neutral-700"
        transition="all ease-in-out duration-250" items-center gap-1.5 rounded-lg px-4
        py-3
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :delay="200"
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
            cursor-pointer
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
        v-motion
        bg="neutral-50 dark:neutral-800"
        hover="bg-neutral-200 dark:bg-neutral-700"
        transition="all ease-in-out duration-250"
        w-full flex cursor-pointer rounded-lg px-4 py-3
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :delay="250"
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
        v-motion
        bg="neutral-50 dark:neutral-800"
        hover="bg-neutral-200 dark:bg-neutral-700"
        transition="all ease-in-out duration-250"
        w-full flex cursor-pointer rounded-lg px-4 py-3
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :delay="300"
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
            <span>{{ t('settings.animations.stage-transitions.title') }}</span>
          </div>
          <div select-none>
            <Transition name="slide-away" mode="out-in">
              <div
                v-if="disableTransitions"
                i-solar:people-nearby-bold-duotone
                transition="all ease-in-out duration-250"
              />
              <div
                v-else
                i-solar:running-2-line-duotone
                transition="all ease-in-out duration-250"
              />
            </Transition>
          </div>
        </div>
      </label>
    </div>
    <div text="neutral-200/50 dark:neutral-600/20" pointer-events-none fixed bottom-0 right-0 z--1 translate-x-10 translate-y-10>
      <div v-motion text="60" i-lucide:cog />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
