<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ButtonBar, CheckBar, IconItem } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { electronOpenDevtoolsWindow, electronOpenMainDevtools } from '../../../../shared/eventa'

const { t } = useI18n()
const settings = useSettings()
const router = useRouter()

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
    title: 'Plugin Host Debug',
    description: 'Inspect discovered/enabled/loaded plugins and control load/unload lifecycle',
    icon: 'i-solar:bug-bold-duotone',
    to: '/devtools/plugin-host',
  },
  {
    title: 'Updater',
    description: 'Inspect updater state, explicit feed overrides, and install actions',
    icon: 'i-solar:restart-bold-duotone',
    to: '/devtools/updater',
  },
  {
    title: 'Screen Capture',
    description: 'Capture screen or window as video and/or audio streams',
    icon: 'i-solar:screen-share-bold-duotone',
    to: '/devtools/screen-capture',
  },
  {
    title: 'Vision Capture',
    description: 'Capture a screen frame and inspect the output payload',
    icon: 'i-solar:eye-closed-bold-duotone',
    to: '/devtools/vision',
  },
])

const openDevTools = useElectronEventaInvoke(electronOpenMainDevtools)
const openDevtoolsWindow = useElectronEventaInvoke(electronOpenDevtoolsWindow)
</script>

<template>
  <ButtonBar
    v-model="settings.disableTransitions"
    mb-2
    icon="i-solar:settings-minimalistic-outline"
    text="settings.pages.page.developers.open-devtools.title"
    transition="all ease-in-out duration-250"
    @click="() => openDevTools()"
  >
    {{ t('settings.pages.page.developers.open-devtools.button') }}
  </ButtonBar>
  <ButtonBar
    mb-2
    icon="i-solar:code-bold-duotone"
    :text="t('tamagotchi.settings.devtools.pages.markdown-stress.title')"
    transition="all ease-in-out duration-250"
    @click="() => openDevtoolsWindow({ key: 'markdown-stress', route: '/devtools/markdown-stress' })"
  >
    {{ t('tamagotchi.settings.devtools.pages.markdown-stress.title') }}
  </ButtonBar>
  <ButtonBar
    mb-2
    icon="i-solar:chart-square-bold-duotone"
    :text="t('tamagotchi.settings.devtools.pages.lag-visualizer.title')"
    transition="all ease-in-out duration-250"
    @click="() => router.push('/devtools/performance-visualizer')"
  >
    {{ t('tamagotchi.settings.devtools.pages.lag-visualizer.title') }}
  </ButtonBar>
  <CheckBar
    v-model="settings.disableTransitions"
    mb-2
    icon-on="i-solar:people-nearby-bold-duotone"
    icon-off="i-solar:running-2-line-duotone"
    text="settings.animations.stage-transitions.title"
    transition="all ease-in-out duration-250"
  />
  <CheckBar
    v-model="settings.usePageSpecificTransitions"
    :disabled="settings.disableTransitions"
    icon-on="i-solar:running-2-line-duotone"
    icon-off="i-solar:people-nearby-bold-duotone"
    text="settings.animations.use-page-specific-transitions.title"
    description="settings.animations.use-page-specific-transitions.description"
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
        transitionDelay: `${(index) * 50}ms`, // delay between each item, unocss doesn't support dynamic generation of classes now
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
