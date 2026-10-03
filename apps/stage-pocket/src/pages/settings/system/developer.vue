<script setup lang="ts">
import { CheckBar, IconItem } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const settings = useSettings()

const menu = computed(() => [
  {
    title: 'Audio Record',
    description: 'Test Audio related composables',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/audio-record',
  },
  {
    title: 'Background Theme color blending',
    description: 'Test blending & theme',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/background-gradient-blending',
  },
  {
    title: 'Background removal (WebGPU required)',
    description: 'Utility for background removal',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/background-removal',
  },
  {
    title: 'Chat',
    description: 'Chat',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/chat',
  },
  {
    title: 'Gesture Circle (Desktop only)',
    description: 'Test gesture recognition',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/gesture-circle',
  },
  {
    title: 'Image',
    description: 'Image',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/image',
  },
  {
    title: 'Polaroid',
    description: 'Utility for taking shots of models',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/polaroid',
  },
  {
    title: t('settings.pages.system.sections.section.developer.sections.section.use-magic-keys.title'),
    description: t('settings.pages.system.sections.section.developer.sections.section.use-magic-keys.description'),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/use-magic-keys',
  },
  {
    title: 'Color extract',
    description: 'Test color extraction',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/vibrant',
  },
  {
    title: 'Aliyun Real-time Transcriber',
    description: 'Stream microphone audio to Aliyun NLS and inspect live transcripts',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/providers-transcription-realtime-aliyun-nls',
  },
  {
    title: 'Performance Playground',
    description: 'VRM expressions + TTS lip sync playground',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/performance-playground',
  },
  {
    title: 'Notification',
    description: 'Test notification',
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/notifications',
  },
  {
    title: 'WebSocket Inspector',
    description: 'Inspect raw WebSocket traffic',
    icon: 'i-solar:transfer-horizontal-bold-duotone',
    to: '/devtools/websocket-inspector',
  },
])
</script>

<template>
  <CheckBar
    v-model="settings.disableTransitions"
    v-motion
    :class="['mb-2', 'transition-all duration-250 ease-in-out']"
    text="settings.animations.stage-transitions.title"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (19 * 10)"
    :delay="1 * 50"
  />
  <CheckBar
    v-model="settings.usePageSpecificTransitions"
    v-motion
    :disabled="settings.disableTransitions"
    text="settings.animations.use-page-specific-transitions.title"
    description="settings.animations.use-page-specific-transitions.description"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (20 * 10)"
    :delay="2 * 50"
    :class="['transition-all duration-250 ease-in-out']"
  />

  <div :class="['flex flex-col gap-4', 'pb-12']">
    <IconItem
      v-for="(item, index) in menu"
      :key="item.to"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250"
      :style="{
        transitionDelay: `${index * 50}ms`, // Stagger items because UnoCSS cannot generate classes from runtime values.
      }"
      :title="item.title"
      :description="item.description"
      :icon="item.icon"
      :to="item.to"
    />
  </div>

  <div
    v-motion
    :class="[
      'text-neutral-200/50 dark:text-neutral-600/20',
      'pointer-events-none fixed top-[65dvh] right--15 z--1',
      'flex items-center justify-center',
    ]"
    :initial="{ scale: 0.9, opacity: 0, rotate: 30 }"
    :enter="{ scale: 1, opacity: 1, rotate: 0 }"
    :duration="250"
  >
    <div :class="['text-60', 'i-solar:code-bold-duotone']" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
