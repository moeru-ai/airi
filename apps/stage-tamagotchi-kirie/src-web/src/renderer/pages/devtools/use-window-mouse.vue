<script setup lang="ts">
import { useHostRelativeMouse } from '@proj-airi/stage-host-context'

const { x, y } = useHostRelativeMouse()
</script>

<template>
  <div class="flex flex-col md:flex-row">
    <div>
      <div class="flex justify-center gap-3">
        {{ x }}, {{ y }}
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: useWindowMouse
  subtitleKey: tamagotchi.settings.devtools.title
</route>
