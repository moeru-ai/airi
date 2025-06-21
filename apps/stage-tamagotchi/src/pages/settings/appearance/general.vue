<script setup lang="ts">
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'

import CheckBar from '../../../components/Settings/CheckBar.vue'

const settings = useSettings()
const { allowVisibleOnAllWorkspaces } = storeToRefs(settings)

const dark = useDark()
</script>

<template>
  <CheckBar
    v-model="dark"
    v-motion
    mb-2
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (2 * 10)"
    :delay="2 * 50"
    icon-on="i-solar:moon-stars-bold-duotone"
    icon-off="i-solar:sun-fog-bold-duotone"
    text="settings.theme"
    transition="all ease-in-out duration-250"
  />
  <CheckBar
    v-model="allowVisibleOnAllWorkspaces"
    v-motion
    mb-2
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (2 * 10)"
    :delay="2 * 50"
    icon-on="i-solar:check-circle-bold"
    icon-off="i-solar:close-circle-bold"
    text="settings.allow-visible-on-all-workspaces.title"
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
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
