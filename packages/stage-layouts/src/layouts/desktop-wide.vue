<script setup lang="ts">
import { electron } from '@proj-airi/electron-eventa'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAsyncState } from '@vueuse/core'
import { RouterView } from 'vue-router'

const isMacOSInvoke = useElectronEventaInvoke(electron.app.isMacOS)
const isWindowsInvoke = useElectronEventaInvoke(electron.app.isWindows)
const isLinuxInvoke = useElectronEventaInvoke(electron.app.isLinux)
const { state: isMacOS } = useAsyncState(() => isMacOSInvoke(), false)
const { state: isWindows } = useAsyncState(() => isWindowsInvoke(), false)
const { state: isLinux } = useAsyncState(() => isLinuxInvoke(), false)
</script>

<template>
  <div
    :style="{
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
    }"
    :class="[
      'h-full w-full',
      'flex flex-col',
    ]"
  >
    <div
      :class="[
        'mt-1 mx-1',
        'flex flex-col items-center justify-center',
        'w-[calc(100%-8px)]', 'py-2 px-2',
        'drag-region',
        'bg-black/35 dark:bg-white/35',
        'text-white dark:text-black',
        'backdrop-blur-xl',
        'rounded-lg',
      ]"
    >
      <div v-if="isMacOS" class="" />
      <div class="text-sm">
        Project AIRI
      </div>
      <div v-if="isWindows || isLinux" class="" />
    </div>
    <div
      :class="[
        'mt-1',
        'overflow-y-auto',
      ]"
    >
      <!-- Content -->
      <RouterView />
    </div>
  </div>
</template>
