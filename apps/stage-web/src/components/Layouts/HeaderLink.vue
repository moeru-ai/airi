<script setup lang="ts">
import { useDark } from '@vueuse/core'
import { RouterLink } from 'vue-router'

import LogoDark from '../../assets/logo-dark.svg'
import Logo from '../../assets/logo.svg'

const dark = useDark()
</script>

<template>
  <RouterLink
    to="/" flex="~" items-center
    gap-2 px-2 text-nowrap text-2xl outline-none
  >
    <template v-if="dark">
      <img :src="LogoDark" h-8 w-8 class="theme-colored">
    </template>
    <template v-else>
      <img :src="Logo" h-8 w-8 class="theme-colored">
    </template>
    <div translate-y="[2px]" font-quicksand font-semibold>
      <span>AIRI</span>
    </div>
  </RouterLink>
</template>

<style scoped>
.theme-colored {
  filter: hue-rotate(calc(var(--chromatic-hue, 0) * 1deg));
}
</style>
