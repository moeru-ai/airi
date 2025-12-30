<script setup lang="ts">
import { useTheme } from '@proj-airi/ui'

import { PartAnimatedWave, PatternCross } from '.'

const { isDark } = useTheme()
</script>

<template>
  <PatternCross>
    <PartAnimatedWave
      :fill-color="isDark
        ? 'oklch(35% calc(var(--chromatic-chroma) * 0.6) var(--chromatic-hue))'
        : 'color-mix(in srgb, oklch(95% calc(var(--chromatic-chroma-50) * 0.5) var(--chromatic-hue)) 80%, oklch(100% 0 360))'"
      class="h-full w-full"
    >
      <div class="relative h-full w-full from-black/10 via-black/0 to-black/0 bg-gradient-to-b" />
    </PartAnimatedWave>
  </PatternCross>
</template>
