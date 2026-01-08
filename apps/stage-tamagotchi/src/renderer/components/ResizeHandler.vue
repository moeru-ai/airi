<script setup lang="ts">
import { useAsyncState } from '@vueuse/core'

import { electron } from '../../shared/electron'
import { useElectronEventaInvoke, useElectronWindowResize } from '../composables/electron-vueuse'

const isWindows = useElectronEventaInvoke(electron.app.isWindows)
const { handleResizeStart } = useElectronWindowResize()
const isWindowsRef = useAsyncState(() => isWindows(), false)
</script>

<template>
  <div v-if="isWindowsRef" class="resize-handles">
    <div class="handle n" @mousedown="handleResizeStart($event, 'n')" />
    <div class="handle s" @mousedown="handleResizeStart($event, 's')" />
    <div class="handle e" @mousedown="handleResizeStart($event, 'e')" />
    <div class="handle w" @mousedown="handleResizeStart($event, 'w')" />
    <div class="handle ne" @mousedown="handleResizeStart($event, 'ne')" />
    <div class="handle nw" @mousedown="handleResizeStart($event, 'nw')" />
    <div class="handle se" @mousedown="handleResizeStart($event, 'se')" />
    <div class="handle sw" @mousedown="handleResizeStart($event, 'sw')" />
  </div>
</template>

<style scoped>
.resize-handles {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 9999;
}

.handle {
  position: absolute;
  pointer-events: auto;
}

.handle.n { top: 0; left: 5px; right: 5px; height: 5px; cursor: n-resize; }
.handle.s { bottom: 0; left: 5px; right: 5px; height: 5px; cursor: s-resize; }
.handle.e { top: 5px; bottom: 5px; right: 0; width: 5px; cursor: e-resize; }
.handle.w { top: 5px; bottom: 5px; left: 0; width: 5px; cursor: w-resize; }

.handle.nw { top: 0; left: 0; width: 10px; height: 10px; cursor: nw-resize; }
.handle.ne { top: 0; right: 0; width: 10px; height: 10px; cursor: ne-resize; }
.handle.sw { bottom: 0; left: 0; width: 10px; height: 10px; cursor: sw-resize; }
.handle.se { bottom: 0; right: 0; width: 10px; height: 10px; cursor: se-resize; }
</style>
