<script setup lang="ts">
import { IconStatusItem } from '@proj-airi/stage-ui/components'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import IconAnimation from '../../../components/IconAnimation.vue'

import { useIconAnimation } from '../../../composables/icon-animation'

const { t } = useI18n()

interface Module {
  id: string
  name: string
  description: string
  icon?: string
  iconColor?: string
  iconImage?: string
  to: string
  configured: boolean
}

// TODO: categorize modules, such as essential, messaging, gaming, etc.
const modulesList = computed<Module[]>(() => [
  {
    id: 'consciousness',
    name: t('settings.pages.modules.consciousness.title'),
    description: t('settings.pages.modules.consciousness.description'),
    icon: 'i-solar:ghost-bold-duotone',
    to: '/settings/modules/consciousness',
    configured: useConsciousnessStore().configured,
  },
  {
    id: 'speech',
    name: t('settings.pages.modules.speech.title'),
    description: t('settings.pages.modules.speech.description'),
    icon: 'i-solar:user-speak-rounded-bold-duotone',
    to: '/settings/modules/speech',
    configured: useSpeechStore().configured,
  },
  {
    id: 'hearing',
    name: t('settings.pages.modules.hearing.title'),
    description: t('settings.pages.modules.hearing.description'),
    icon: 'i-solar:microphone-3-bold-duotone',
    to: '/settings/modules/hearing',
    configured: false,
  },
  {
    id: 'vision',
    name: t('settings.pages.modules.vision.title'),
    description: t('settings.pages.modules.vision.description'),
    icon: 'i-solar:eye-closed-bold-duotone',
    to: '',
    configured: false,
  },
  {
    id: 'memory-short-term',
    name: t('settings.pages.modules.memory-short-term.title'),
    description: t('settings.pages.modules.memory-short-term.description'),
    icon: 'i-solar:bookmark-bold-duotone',
    to: '/settings/modules/memory-short-term',
    configured: false,
  },
  {
    id: 'memory-long-term',
    name: t('settings.pages.modules.memory-long-term.title'),
    description: t('settings.pages.modules.memory-long-term.description'),
    icon: 'i-solar:book-bookmark-bold-duotone',
    to: '/settings/modules/memory-long-term',
    configured: false,
  },
  {
    id: 'messaging-discord',
    name: t('settings.pages.modules.messaging-discord.title'),
    description: t('settings.pages.modules.messaging-discord.description'),
    icon: 'i-simple-icons:discord',
    to: '',
    configured: false,
  },
  {
    id: 'x',
    name: t('settings.pages.modules.x.title'),
    description: t('settings.pages.modules.x.description'),
    icon: 'i-simple-icons:x',
    to: '',
    configured: false,
  },
  {
    id: 'game-minecraft',
    name: t('settings.pages.modules.gaming-minecraft.title'),
    description: t('settings.pages.modules.gaming-minecraft.description'),
    iconColor: 'i-vscode-icons:file-type-minecraft',
    to: '',
    configured: false,
  },
  {
    id: 'game-factorio',
    name: t('settings.pages.modules.gaming-factorio.title'),
    description: t('settings.pages.modules.gaming-factorio.description'),
    iconImage: '',
    to: '',
    configured: false,
  },
  {
    id: 'mcp-server',
    name: t('settings.pages.modules.mcp-server.title'),
    description: t('settings.pages.modules.mcp-server.description'),
    icon: 'i-solar:server-bold-duotone',
    to: '/settings/modules/mcp',
    configured: false,
  },
])

const {
  iconAnimationStarted,
  showIconAnimation,
  animationIcon,
} = useIconAnimation('i-solar:layers-bold-duotone')
</script>

<template>
  <div grid="~ cols-1 sm:cols-2 gap-4">
    <IconStatusItem
      v-for="(module, index) of modulesList"
      :key="module.id"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + index * 10"
      :delay="index * 50"
      :title="module.name"
      :description="module.description"
      :icon="module.icon"
      :icon-color="module.iconColor"
      :icon-image="module.iconImage"
      :to="module.to"
      :configured="module.configured"
    />
  </div>
  <IconAnimation
    v-if="showIconAnimation"
    :icon="animationIcon"
    :icon-size="12"
    :duration="1000"
    :started="iconAnimationStarted"
    :is-reverse="true"
    :z-index="-1"
    text-color="text-neutral-200/50 dark:text-neutral-600/20"
    position="calc(100dvw - 9.5rem), calc(100dvh - 9.5rem)"
  />
  <div
    v-else
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, y: 20 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:layers-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
