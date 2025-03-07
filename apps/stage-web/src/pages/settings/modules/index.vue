<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import FactorioIcon from '../../../assets/icons/modules/games/factorio.png'

const router = useRouter()

interface Module {
  id: string
  name: string
  description: string
  icon: string | { imagePath: string }
  to: string
  configured: boolean
}

const modulesList = computed<Module[]>(() => [
  {
    id: 'consciousness',
    name: 'Consciousness',
    description: 'Thinking, vision, speech synthesis, gaming, etc.',
    icon: 'i-lucide:ghost',
    to: '/settings/modules/consciousness',
    configured: false,
  },
  {
    id: 'hearing',
    name: 'Hearing',
    description: 'Hearing, speech recognition, etc.',
    icon: 'i-lucide:ear',
    to: '',
    configured: false,
  },
  {
    id: 'messaging-discord',
    name: 'Discord',
    description: 'Messaging, notifications, etc.',
    icon: 'i-simple-icons:discord',
    to: '',
    configured: false,
  },
  {
    id: 'speech',
    name: 'Speech',
    description: 'Speech synthesis, etc.',
    icon: 'i-lucide:mic',
    to: '',
    configured: false,
  },
  {
    id: 'memory-short-term',
    name: 'Short-Term Memory',
    description: 'Short-term memory, etc.',
    icon: 'i-lucide:book',
    to: '',
    configured: false,
  },
  {
    id: 'memory-long-term',
    name: 'Long-Term Memory',
    description: 'Long-term memory, etc.',
    icon: 'i-lucide:book-copy',
    to: '',
    configured: false,
  },
  {
    id: 'vision',
    name: 'Vision',
    description: 'Vision, etc.',
    icon: 'i-lucide:eye',
    to: '',
    configured: false,
  },
  {
    id: 'game-minecraft',
    name: 'Minecraft',
    description: 'Playing Minecraft with you, etc.',
    icon: 'i-vscode-icons:file-type-minecraft',
    to: '',
    configured: false,
  },
  {
    id: 'game-factorio',
    name: 'Factorio',
    description: 'Playing Factorio with you, etc.',
    icon: {
      imagePath: FactorioIcon,
    },
    to: '',
    configured: false,
  },
])
</script>

<template>
  <div flex="~ row" items-center gap-2>
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-800">Settings</span>
      </div>
      <div text-3xl font-semibold>
        Modules
      </div>
    </h1>
  </div>
  <div grid="~ cols-1 gap-2">
    <div
      v-for="module in modulesList" :key="module.id" bg="neutral-300/50 dark:neutral-600" w-full of-hidden rounded-xl
      flex="~ col 1"
    >
      <RouterLink
        :to="module.to" bg="neutral-100 dark:neutral-800" hover="bg-neutral-200 dark:bg-neutral-700"
        transition="all ease-in-out duration-250" h-full w-full flex items-center gap-1.5 rounded-lg px-4 py-5
        outline-none class="[&_.provider-icon]:grayscale-100 [&_.provider-icon]:hover:grayscale-0"
      >
        <div flex="~ col 1" gap-1.5>
          <div
            v-if="typeof module.icon === 'string'" :class="module.icon" class="provider-icon size-10"
            transition="filter duration-250 ease-in-out"
          />
          <img
            v-else
            :src="module.icon.imagePath" class="settings-section-icon op-30 grayscale-100 filter hover:grayscale-0"
            transition="all ease-in-out duration-500" absolute right-0 size-24 translate-y-4
          >
          <div>
            {{ module.name }}
          </div>
        </div>
      </RouterLink>
      <div p-2>
        <div v-if="module.configured" size-3 bg="green-500 dark:green-600" rounded-full />
        <div v-else size-3 bg="neutral-400 dark:neutral-500" rounded-full />
      </div>
    </div>
  </div>
  <div fixed bottom-0 right-0 z--1 text="neutral-100/80 dark:neutral-500/20">
    <div text="40" i-lucide:blocks translate-x-10 translate-y-10 />
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
