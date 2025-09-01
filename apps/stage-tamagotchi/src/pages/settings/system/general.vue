<script setup lang="ts">
import { all } from '@proj-airi/i18n'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { FieldCheckbox, FieldSelect } from '@proj-airi/ui'
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const settings = useSettings()

const { t } = useI18n()
const { allowVisibleOnAllWorkspaces } = storeToRefs(settings)

const dark = useDark()

const languages = computed(() => {
  return Object.entries(all).map(([value, label]) => ({ label, value }))
})
</script>

<template>
  <div rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800 flex="~ col gap-4">
    <FieldCheckbox
      v-model="dark"
      v-motion
      mb-2
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (2 * 10)"
      :delay="2 * 50"
      :label="t('settings.theme.title')"
      :description="t('settings.theme.description')"
    />
    <FieldCheckbox
      v-model="allowVisibleOnAllWorkspaces"
      v-motion
      mb-2
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (2 * 10)"
      :delay="2 * 50"
      :label="t('tamagotchi.settings.allow-visible-on-all-workspaces.title')"
      :description="t('tamagotchi.settings.allow-visible-on-all-workspaces.description')"
    />

    <!-- Language Setting -->
    <FieldSelect
      v-model="settings.language"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (3 * 10)"
      :delay="3 * 50"
      transition="all ease-in-out duration-250"
      :label="t('settings.language.title')"
      :description="t('settings.language.description')"
      :options="languages"
    />

    <div
      v-motion
      text="neutral-200/50 dark:neutral-600/20" pointer-events-none
      fixed top="[65dvh]" right--15 z--1
      :initial="{ scale: 0.9, opacity: 0, rotate: 30 }"
      :enter="{ scale: 1, opacity: 1, rotate: 0 }"
      :duration="250"
      flex items-center justify-center
    >
      <div text="60" i-solar:emoji-funny-square-bold-duotone />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
