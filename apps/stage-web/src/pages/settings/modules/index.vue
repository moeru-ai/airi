<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import FactorioIcon from '../../../assets/icons/modules/games/factorio.png'

const router = useRouter()

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
    iconColor: 'i-vscode-icons:file-type-minecraft',
    to: '',
    configured: false,
  },
  {
    id: 'game-factorio',
    name: 'Factorio',
    description: 'Playing Factorio with you, etc.',
    iconImage: FactorioIcon,
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
        <span text="neutral-300 dark:neutral-500">Settings</span>
      </div>
      <div text-3xl font-semibold>
        Modules
      </div>
    </h1>
  </div>
  <div grid="~ cols-1 sm:cols-2 gap-4">
    <div
      v-for="module in modulesList" :key="module.id"
      flex="~ col"
      bg="neutral-200/50 dark:neutral-700"
      border="neutral-100 dark:neutral-700 hover:primary-500 dark:hover:primary-400 solid 2"
      drop-shadow="none hover:[0px_4px_4px_rgba(220,220,220,0.4)] active:[0px_0px_0px_rgba(220,220,220,0.25)] dark:hover:none"
      class="menu-icon-item-modules"
      transition="all ease-in-out duration-200"
      w-full of-hidden rounded-xl
    >
      <RouterLink
        flex="~ row"
        bg="neutral-50 dark:neutral-800"
        transition="all ease-in-out duration-200"
        relative w-full items-center overflow-hidden rounded-lg p-5 text-left
        :to="module.to"
      >
        <div z-1 flex-1>
          <div
            text-lg font-bold
            class="menu-icon-item-modules-title"
            transition="all ease-in-out duration-200"
          >
            {{ module.name }}
          </div>
          <div
            text="sm neutral-500 dark:neutral-400"
            class="menu-icon-item-modules-description"
            transition="all ease-in-out duration-200"
          >
            <span>{{ module.description }}</span>
          </div>
        </div>
        <template v-if="module.icon">
          <div
            class="menu-icon-item-modules-icon"
            transition="all ease-in-out duration-500"
            absolute right-0 size-16 translate-y-2
            text="neutral-400/50 dark:neutral-600/50"
            grayscale-100
            :class="[module.icon]"
          />
        </template>
        <template v-if="module.iconColor">
          <div
            class="menu-icon-item-modules-icon-color"
            transition="all ease-in-out duration-500"
            absolute right-0 size-16 translate-y-2
            text="neutral-400/50 dark:neutral-600/50"
            grayscale-100
            :class="[module.iconColor]"
          />
        </template>
        <template v-if="module.iconImage">
          <img
            :src="module.iconImage"
            class="menu-icon-item-modules-icon-image"
            transition="all ease-in-out duration-500"
            absolute right-0 size-16 translate-y-2
            grayscale-100
          >
        </template>
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

<style scoped>
.menu-icon-item-modules::after {
  --at-apply: 'bg-dotted-[neutral-200] hover:bg-dotted-[primary-300/50] dark:bg-dotted-[neutral-700/80] dark:hover:bg-dotted-[primary-200/20]';
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  background-size: 10px 10px;
  content: '';
  mask-image: linear-gradient(165deg, white 30%, transparent 50%);
}

.menu-icon-item-modules:hover .menu-icon-item-modules-title {
  --at-apply: text-primary-500;
}

.menu-icon-item-modules:hover .menu-icon-item-modules-description {
  --at-apply: text-primary-500;
  opacity: 0.8;
}

.menu-icon-item-modules:hover .menu-icon-item-modules-icon {
  --at-apply: text-primary-500;
  scale: 1.2;
  opacity: 0.2;
  filter: grayscale(0);
}

.menu-icon-item-modules:hover .menu-icon-item-modules-icon-color {
  scale: 1.2;
  filter: grayscale(0);
}

.menu-icon-item-modules:hover .menu-icon-item-modules-icon-image {
  scale: 1.2;
  filter: grayscale(0);
}

.dark .menu-icon-item-modules:hover .menu-icon-item-modules-title {
  --at-apply: text-primary-400;
}

.dark .menu-icon-item-modules:hover .menu-icon-item-modules-description {
  --at-apply: text-primary-400;
  opacity: 0.8;
}

.dark .menu-icon-item-modules:hover .menu-icon-item-modules-icon {
  --at-apply: text-primary-400;
  opacity: 0.2;
}
</style>
