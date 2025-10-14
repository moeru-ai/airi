<script setup lang="ts">
import { useWindowMouse } from '../../stores/window-mouse'

const { x, y } = useWindowMouse()
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
</route>
