<script setup lang="ts">
import { useDark } from '@vueuse/core'

import LogoDark from '../../assets/logo-dark.svg'
import Logo from '../../assets/logo.svg'

const dark = useDark()
</script>

<template>
  <header mb-1 mt-2 w-full gap-2>
    <div flex="~ 1" w-full items-center justify-center gap-2 px-2 text-nowrap text-lg>
      <template v-if="dark">
        <img :src="LogoDark" h-8 w-8 class="theme-colored">
      </template>
      <template v-else>
        <img :src="Logo" h-8 w-8 class="theme-colored">
      </template>
      <div font-cute>
        <span>アイリ</span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.theme-colored {
  filter: hue-rotate(calc(var(--theme-colors-hue, 0) * 1deg));
}
</style>
