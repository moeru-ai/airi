<script setup lang="ts">
import type { DockPosition } from '@proj-airi/electron-eventa'

import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useDockModeStore } from '../../../stores/dock-mode'

const { t } = useI18n()
const dockMode = useDockModeStore()
const {
  status,
  availableWindows,
  isLoadingWindows,
  savedPosition,
  savedOffsetX,
  savedOffsetY,
} = storeToRefs(dockMode)

const selectedWindowId = ref<string>('')

const positionOptions: { value: DockPosition, labelKey: string }[] = [
  { value: 'left', labelKey: 'tamagotchi.dock-mode.position.left' },
  { value: 'right', labelKey: 'tamagotchi.dock-mode.position.right' },
  { value: 'top', labelKey: 'tamagotchi.dock-mode.position.top' },
  { value: 'bottom', labelKey: 'tamagotchi.dock-mode.position.bottom' },
]

onMounted(() => {
  dockMode.fetchStatus()
  dockMode.refreshWindows()
})

async function handleToggleDock() {
  if (status.value.active) {
    await dockMode.stopDock()
  }
  else if (selectedWindowId.value) {
    await dockMode.startDock(selectedWindowId.value)
  }
}
</script>

<template>
  <div flex="~ col gap-3" pb-12>
    <!-- Status -->
    <div
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250"
      class="rounded-lg px-4 py-3"
      bg="neutral-50 dark:neutral-800"
    >
      <div flex="~ items-center gap-2" text-sm>
        <div
          class="size-2 rounded-full"
          :class="status.active ? 'bg-green-500' : 'bg-neutral-400'"
        />
        <span v-if="status.active" text="neutral-700 dark:neutral-300">
          {{ t('tamagotchi.dock-mode.status.active', { name: status.targetWindowName || status.targetWindowId }) }}
        </span>
        <span v-else text="neutral-500">
          {{ t('tamagotchi.dock-mode.status.inactive') }}
        </span>
      </div>
    </div>

    <!-- Window list -->
    <div
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250"
      :delay="50"
      class="rounded-lg px-4 py-3"
      bg="neutral-50 dark:neutral-800"
    >
      <div flex="~ items-center justify-between" mb-2>
        <span text="sm neutral-700 dark:neutral-300">
          {{ t('tamagotchi.dock-mode.select-window') }}
        </span>
        <button
          class="rounded-md px-2 py-1 text-xs transition-colors"
          bg="neutral-200 dark:neutral-700"
          hover="bg-neutral-300 dark:bg-neutral-600"
          text="neutral-700 dark:neutral-300"
          :disabled="isLoadingWindows"
          @click="dockMode.refreshWindows()"
        >
          {{ t('tamagotchi.dock-mode.refresh-windows') }}
        </button>
      </div>

      <div v-if="isLoadingWindows" text="xs neutral-500" py-2>
        {{ t('tamagotchi.dock-mode.loading-windows') }}
      </div>
      <div v-else-if="availableWindows.length === 0" text="xs neutral-500" py-2>
        {{ t('tamagotchi.dock-mode.no-windows') }}
      </div>
      <div v-else class="max-h-48 flex flex-col gap-1 overflow-y-auto">
        <button
          v-for="win in availableWindows"
          :key="win.id"
          class="w-full flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors"
          :class="selectedWindowId === win.id
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'"
          @click="selectedWindowId = win.id"
        >
          <img
            v-if="win.thumbnail"
            :src="win.thumbnail"
            class="size-8 rounded object-cover"
          >
          <div v-else class="size-8 rounded bg-neutral-300 dark:bg-neutral-600" />
          <span class="truncate">{{ win.name }}</span>
        </button>
      </div>
    </div>

    <!-- Dock position -->
    <div
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250"
      :delay="100"
      class="rounded-lg px-4 py-3"
      bg="neutral-50 dark:neutral-800"
    >
      <span class="mb-2 block text-sm" text="neutral-700 dark:neutral-300">
        {{ t('tamagotchi.dock-mode.dock-position') }}
      </span>
      <div flex="~ gap-2">
        <button
          v-for="opt in positionOptions"
          :key="opt.value"
          class="rounded-md px-3 py-1.5 text-xs transition-colors"
          :class="savedPosition === opt.value
            ? 'bg-blue-500 text-white'
            : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'"
          @click="savedPosition = opt.value"
        >
          {{ t(opt.labelKey) }}
        </button>
      </div>
    </div>

    <!-- Offset -->
    <div
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250"
      :delay="150"
      class="rounded-lg px-4 py-3"
      bg="neutral-50 dark:neutral-800"
    >
      <div flex="~ gap-4">
        <label flex="~ col gap-1 1">
          <span text="xs neutral-500">{{ t('tamagotchi.dock-mode.offset-x') }}</span>
          <input
            v-model.number="savedOffsetX"
            type="number"
            class="rounded-md border-none px-2 py-1 text-sm outline-none"
            bg="neutral-200 dark:neutral-700"
            text="neutral-700 dark:neutral-300"
          >
        </label>
        <label flex="~ col gap-1 1">
          <span text="xs neutral-500">{{ t('tamagotchi.dock-mode.offset-y') }}</span>
          <input
            v-model.number="savedOffsetY"
            type="number"
            class="rounded-md border-none px-2 py-1 text-sm outline-none"
            bg="neutral-200 dark:neutral-700"
            text="neutral-700 dark:neutral-300"
          >
        </label>
      </div>
    </div>

    <!-- Start/Stop button -->
    <button
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250"
      :delay="200"
      class="w-full rounded-lg px-4 py-3 text-sm font-medium transition-colors"
      :class="status.active
        ? 'bg-red-500 hover:bg-red-600 text-white'
        : 'bg-blue-500 hover:bg-blue-600 text-white'"
      :disabled="!status.active && !selectedWindowId"
      @click="handleToggleDock"
    >
      {{ status.active ? t('tamagotchi.dock-mode.stop') : t('tamagotchi.dock-mode.start') }}
    </button>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.system.dock-mode.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
