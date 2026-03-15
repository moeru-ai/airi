<script setup lang="ts">
import { CheckBar, IconItem } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const settings = useSettings()

const devPrefix = 'settings.pages.system.sections.section.developer.sections.section'

const menu = computed(() => [
  {
    title: t(`${devPrefix}.audio-record.title`),
    description: t(`${devPrefix}.audio-record.description`),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/audio-record',
  },
  {
    title: t(`${devPrefix}.performance-visualizer.title`),
    description: t(`${devPrefix}.performance-visualizer.description`),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/performance-visualizer',
  },
  {
    title: t(`${devPrefix}.markdown-stress.title`),
    description: t(`${devPrefix}.markdown-stress.description`),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/markdown-stress',
  },
  {
    title: t(`${devPrefix}.background-gradient-blending.title`),
    description: t(`${devPrefix}.background-gradient-blending.description`),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/background-gradient-blending',
  },
  {
    title: t(`${devPrefix}.background-removal.title`),
    description: t(`${devPrefix}.background-removal.description`),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/background-removal',
  },
  {
    title: t(`${devPrefix}.chat.title`),
    description: t(`${devPrefix}.chat.description`),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/chat',
  },
  {
    title: t(`${devPrefix}.gesture-circle.title`),
    description: t(`${devPrefix}.gesture-circle.description`),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/gesture-circle',
  },
  {
    title: t(`${devPrefix}.image.title`),
    description: t(`${devPrefix}.image.description`),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/image',
  },
  {
    title: t(`${devPrefix}.polaroid.title`),
    description: t(`${devPrefix}.polaroid.description`),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/polaroid',
  },
  {
    title: t(`${devPrefix}.context-flow.title`, 'Context Flow'),
    description: t(`${devPrefix}.context-flow.description`),
    icon: 'i-solar:chat-square-call-bold-duotone',
    to: '/devtools/context-flow',
  },
  {
    title: t(`${devPrefix}.websocket-inspector.title`),
    description: t(`${devPrefix}.websocket-inspector.description`),
    icon: 'i-solar:transfer-horizontal-bold-duotone',
    to: '/devtools/websocket-inspector',
  },
  {
    title: 'Plugin Host Debug',
    description: 'Inspect plugin host registry and capability state (desktop runtime)',
    icon: 'i-solar:bug-bold-duotone',
    to: '/devtools/plugin-host',
  },
  {
    title: t(`${devPrefix}.use-magic-keys.title`),
    description: t(`${devPrefix}.use-magic-keys.description`),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/use-magic-keys',
  },
  {
    title: t(`${devPrefix}.vibrant.title`),
    description: t(`${devPrefix}.vibrant.description`),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/vibrant',
  },
  {
    title: t(`${devPrefix}.providers-transcription-realtime-aliyun-nls.title`),
    description: t(`${devPrefix}.providers-transcription-realtime-aliyun-nls.description`),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/providers-transcription-realtime-aliyun-nls',
  },
  {
    title: t(`${devPrefix}.performance-playground.title`),
    description: t(`${devPrefix}.performance-playground.description`),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/performance-playground',
  },
  {
    title: 'MediaPipe Workshop',
    description: 'Single-person mocap playground (MediaPipe backend) with scheduling knobs',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/model-driver-mediapipe',
  },
])
</script>

<template>
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
    :delay="1 * 50"
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
    :delay="2 * 50"
    transition="all ease-in-out duration-250"
  />

  <div flex="~ col gap-4" pb-12>
    <IconItem
      v-for="(item, index) in menu"
      :key="item.to"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250"
      :style="{
        transitionDelay: `${index * 50}ms`, // delay between each item, unocss doesn't support dynamic generation of classes now
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
