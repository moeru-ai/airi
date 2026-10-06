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
    title: t('settings.pages.system.sections.section.developer.sections.section.performance-visualizer.title'),
    description: t('settings.pages.system.sections.section.developer.sections.section.performance-visualizer.description'),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/performance-visualizer',
  },
  {
    title: t('settings.pages.system.sections.section.developer.sections.section.markdown-stress.title'),
    description: t('settings.pages.system.sections.section.developer.sections.section.markdown-stress.description'),
    icon: 'i-solar:sledgehammer-bold-duotone',
    to: '/devtools/markdown-stress',
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
    title: t('tamagotchi.settings.devtools.pages.context-flow.title'),
    description: 'Inspect incoming context updates and outgoing chat stream events',
    icon: 'i-solar:chat-square-call-bold-duotone',
    to: '/devtools/context-flow',
  },
  {
    title: 'WebSocket Inspector',
    description: 'Inspect raw WebSocket traffic',
    icon: 'i-solar:transfer-horizontal-bold-duotone',
    to: '/devtools/websocket-inspector',
  },
  {
    title: 'Web Haptics',
    description: 'Trigger built-in haptic presets and custom pulse patterns',
    icon: 'i-solar:bolt-circle-bold-duotone',
    to: '/devtools/web-haptics',
  },
  {
    title: 'Plugin Host Debug',
    description: 'Inspect plugin host registry and capability state (desktop runtime)',
    icon: 'i-solar:bug-bold-duotone',
    to: '/devtools/plugin-host',
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
    v-track-switch="'settings.system.developer.settings-disable-transitions'"
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
    v-track-switch="'settings.system.developer.settings-use-page-specific-transitions'"
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
  titleKey: settings.pages.system.developer.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
