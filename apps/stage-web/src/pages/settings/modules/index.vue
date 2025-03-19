<script setup lang="ts">
import { IconStatusItem } from '@proj-airi/stage-ui/components'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const router = useRouter()
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
    icon: 'i-lucide:ghost',
    to: '/settings/modules/consciousness',
    configured: false,
  },
  {
    id: 'speech',
    name: t('settings.pages.modules.speech.title'),
    description: t('settings.pages.modules.speech.description'),
    icon: 'i-lucide:mic',
    to: '/settings/modules/speech',
    configured: false,
  },
  {
    id: 'hearing',
    name: t('settings.pages.modules.hearing.title'),
    description: t('settings.pages.modules.hearing.description'),
    icon: 'i-lucide:ear',
    to: '',
    configured: false,
  },
  {
    id: 'vision',
    name: t('settings.pages.modules.vision.title'),
    description: t('settings.pages.modules.vision.description'),
    icon: 'i-lucide:eye',
    to: '',
    configured: false,
  },
  {
    id: 'memory-short-term',
    name: t('settings.pages.modules.memory-short-term.title'),
    description: t('settings.pages.modules.memory-short-term.description'),
    icon: 'i-lucide:book',
    to: '',
    configured: false,
  },
  {
    id: 'memory-long-term',
    name: t('settings.pages.modules.memory-long-term.title'),
    description: t('settings.pages.modules.memory-long-term.description'),
    icon: 'i-lucide:book-copy',
    to: '',
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
])
</script>

<template>
  <div
    v-motion
    flex="~ row" items-center gap-2
    :initial="{ opacity: 0, x: 10 }"
    :enter="{ opacity: 1, x: 0 }"
    :leave="{ opacity: 0, x: -10 }"
    :duration="250"
  >
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500" text-nowrap>{{ t('settings.title') }}</span>
      </div>
      <div text-nowrap text-3xl font-semibold>
        {{ t('settings.pages.modules.title') }}
      </div>
    </h1>
  </div>
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
  <div text="neutral-200/50 dark:neutral-500/20" pointer-events-none fixed bottom-0 right-0 z--1 translate-x-10 translate-y-10>
    <div text="40" i-lucide:blocks />
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
