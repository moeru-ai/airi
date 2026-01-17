<script setup lang="ts">
import { useElectronMouse, useElectronRelativeMouse, useElectronWindowBounds } from '../../composables/electron-vueuse'

const { x: cursorX, y: cursorY } = useElectronMouse()

const windowRelativeMouse = useElectronRelativeMouse()
const windowBounds = useElectronWindowBounds()
</script>

<template>
  <div class="space-y-6">
    <div class="rounded bg-neutral-100 p-3 text-xs font-mono space-y-2 dark:bg-neutral-800">
      <div>windowX = screenX - windowBounds.x</div>
      <div>windowY = screenY - windowBounds.y</div>
      <div class="border-t border-neutral-300 pt-2 dark:border-neutral-700">
        <div>
          {{ windowRelativeMouse.x.value }} = {{ cursorX }} - {{ windowBounds.x.value }}
        </div>
        <div>
          {{ windowRelativeMouse.y.value }} = {{ cursorY }} - {{ windowBounds.y.value }}
        </div>
      </div>
    </div>

    <!-- Visual Representation -->
    <div class="relative border-2 border-neutral-300 rounded bg-white p-8 dark:border-neutral-700 dark:bg-neutral-950" style="height: 400px;">
      <!-- Window representation -->
      <div class="absolute inset-8 border-2 border-primary-500 rounded bg-primary-50/20 dark:bg-primary-950/20">
        <div class="absolute left-0 text-xs text-primary-600 font-semibold -top-6">
          Window ({{ windowBounds.width.value }}×{{ windowBounds.height.value }})
        </div>

        <!-- Center crosshair -->
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div class="h-8 w-0.5 bg-neutral-300 dark:bg-neutral-700" />
          <div class="absolute left-1/2 top-1/2 h-0.5 w-8 bg-neutral-300 -translate-x-1/2 -translate-y-1/2 dark:bg-neutral-700" />
          <div class="absolute left-1/2 top-6 whitespace-nowrap text-[10px] text-neutral-500 -translate-x-1/2">
            Center ({{ Math.round(windowBounds.width.value / 2) }}, {{ Math.round(windowBounds.height.value / 2) }})
          </div>
        </div>

        <!-- Current cursor position (scaled to fit) -->
        <div
          class="absolute h-3 w-3 border-2 border-green-600 rounded-full bg-green-500 -translate-x-1/2 -translate-y-1/2"
          :style="{
            left: `${Math.max(0, Math.min(100, (windowRelativeMouse.x.value / windowBounds.width.value) * 100))}%`,
            top: `${Math.max(0, Math.min(100, (windowRelativeMouse.y.value / windowBounds.height.value) * 100))}%`,
          }"
        >
          <div class="absolute left-4 whitespace-nowrap text-[10px] text-green-600 font-semibold -top-1">
            ({{ Math.round(windowRelativeMouse.x.value) }}, {{ Math.round(windowRelativeMouse.y.value) }})
          </div>
        </div>

        <!-- Corner labels -->
        <div class="absolute text-[10px] text-neutral-500 -left-5 -top-5">
          (0, 0)
        </div>
        <div class="absolute text-[10px] text-neutral-500 -right-5 -top-5">
          ({{ windowBounds.width.value }}, 0)
        </div>
        <div class="absolute text-[10px] text-neutral-500 -bottom-5 -left-5">
          (0, {{ windowBounds.height.value }})
        </div>
        <div class="absolute text-[10px] text-neutral-500 -bottom-5 -right-5">
          ({{ windowBounds.width.value }}, {{ windowBounds.height.value }})
        </div>
      </div>

      <div class="absolute left-0 text-xs text-neutral-600 -bottom-6 dark:text-neutral-400">
        Green dot shows current window-relative cursor position
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: useElectronRelativeMouse
  subtitleKey: tamagotchi.settings.devtools.title
</route>
