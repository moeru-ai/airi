<script setup lang="ts">
import { ButtonBar, CheckBar, IconItem } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronOpenDevtoolsWindow, electronOpenMainDevtools } from '../../../../shared/eventa'
import { useElectronEventaInvoke } from '../../../composables/electron-vueuse'

const { t } = useI18n()
const settings = useSettings()

const menu = computed(() => [
  {
    title: t('settings.pages.system.sections.section.developer.sections.section.use-magic-keys.title'),
    description: t('settings.pages.system.sections.section.developer.sections.section.use-magic-keys.description'),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/use-magic-keys',
  },
  {
    title: t('tamagotchi.settings.pages.system.developer.sections.section.use-window-mouse.title'),
    description: t('tamagotchi.settings.pages.system.developer.sections.section.use-window-mouse.description'),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/use-window-mouse',
  },
  {
    title: 'Displays',
    description: 'Visualize connected displays and cursor position',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/use-electron-all-displays',
  },
  {
    title: 'Widgets Calling',
    description: 'Spawn overlay widgets and test component props',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/widgets-calling',
  },
  {
    title: t('tamagotchi.settings.devtools.pages.context-flow.title'),
    description: 'Inspect incoming context updates and outgoing chat stream events',
    icon: 'i-solar:chat-square-call-bold-duotone',
    to: '/devtools/context-flow',
  },
  {
    title: 'Relative Mouse',
    description: 'Get mouse position relative to the window',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/use-electron-relative-mouse',
  },
  {
    title: 'Aliyun Real-time Transcriber',
    description: 'Stream microphone audio to Aliyun NLS and inspect live transcripts',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/providers-transcription-realtime-aliyun-nls',
  },
  {
    title: 'Beat Sync Visualizer',
    description: 'Plot V-motion targets, trajectory, and scalar Y/Z over time',
    icon: 'i-solar:chart-bold-duotone',
    to: '/devtools/beat-sync',
  },
  {
    title: 'WebSocket Inspector',
    description: 'Inspect raw WebSocket traffic',
    icon: 'i-solar:transfer-horizontal-bold-duotone',
    to: '/devtools/websocket-inspector',
  },
  {
    title: 'Screen Capture',
    description: 'Capture screen or window as video and/or audio streams',
    icon: 'i-solar:screen-share-bold-duotone',
    to: '/devtools/screen-capture',
  },
])

const openDevTools = useElectronEventaInvoke(electronOpenMainDevtools)
const openMarkdownStressWindow = useElectronEventaInvoke(electronOpenDevtoolsWindow)
</script>

<template>
  <ButtonBar
    v-model="settings.disableTransitions"
    v-motion
    mb-2
    icon="i-solar:settings-minimalistic-outline"
    text="settings.pages.page.developers.open-devtools.title"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (19 * 10)"
    :delay="1 * 50"
    transition="all ease-in-out duration-250"
    @click="() => openDevTools()"
  >
    {{ t('settings.pages.page.developers.open-devtools.button') }}
  </ButtonBar>
  <ButtonBar
    v-motion
    mb-2
    icon="i-solar:code-bold-duotone"
    :text="t('tamagotchi.settings.devtools.pages.markdown-stress.title')"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (19 * 10)"
    :delay="2 * 50"
    transition="all ease-in-out duration-250"
    @click="() => openMarkdownStressWindow({ route: '/devtools/markdown-stress' })"
  >
    {{ t('tamagotchi.settings.devtools.pages.markdown-stress.title') }}
  </ButtonBar>
  <CheckBar
    v-model="settings.disableTransitions"
    v-motion
    mb-2
    icon-on="i-solar:people-nearby-bold-duotone"
    icon-off="i-solar:running-2-line-duotone"
    text="settings.animations.stage-transitions.title"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (19 * 10)"
    :delay="3 * 50"
    transition="all ease-in-out duration-250"
  />
  <CheckBar
    v-model="settings.usePageSpecificTransitions"
    v-motion
    :disabled="settings.disableTransitions"
    icon-on="i-solar:running-2-line-duotone"
    icon-off="i-solar:people-nearby-bold-duotone"
    text="settings.animations.use-page-specific-transitions.title"
    description="settings.animations.use-page-specific-transitions.description"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (20 * 10)"
    :delay="4 * 50"
    transition="all ease-in-out duration-250"
  />

  <div flex="~ col gap-4" mt-2 pb-12>
    <IconItem
      v-for="(item, index) in menu"
      :key="item.to"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250"
      :style="{
        transitionDelay: `${(4 + index) * 50}ms`, // delay between each item, unocss doesn't support dynamic generation of classes now
      }"
      :title="item.title"
      :description="item.description"
      :icon="item.icon"
      :to="item.to"
    />
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
    <div text="60" i-solar:code-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.developer.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
