<script setup lang="ts">
import { Section } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useDark } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

const settings = useSettings()
const { t } = useI18n()

const dark = useDark()
</script>

<template>
  <Section
    v-motion
    mb-2
    :title="t('settings.sections.section.general.title')"
    icon="i-solar:filters-bold-duotone"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (1 * 10)"
    :delay="1 * 50"
    transition="all ease-in-out duration-250"
  >
    <!-- Theme Setting -->
    <CheckBar
      v-model="dark"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (2 * 10)"
      :delay="2 * 50"
      icon-on="i-solar:moon-stars-bold-duotone"
      icon-off="i-solar:sun-fog-bold-duotone"
      text="settings.theme"
      transition="all ease-in-out duration-250"
    />
    <!-- Language Setting -->
    <div
      v-motion
      class="w-full flex items-center justify-between rounded-lg px-4 py-3 text-sm outline-none transition-all duration-250 ease-in-out"
      bg="neutral-50 dark:neutral-800"
      hover="bg-neutral-200 dark:bg-neutral-700"
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (3 * 10)"
      :delay="3 * 50"
      transition="all ease-in-out duration-250"
    >
      {{ $t('settings.language.title') }}
      <select
        v-model="settings.language"
        transition="all ease-in-out duration-250"
        cursor-pointer bg-transparent text-right outline-none
      >
        <option value="en-US">
          {{ $t('settings.language.english') }}
        </option>
        <option value="zh-CN">
          {{ $t('settings.language.chinese') }}
        </option>
      </select>
    </div>
  </Section>
</template>
