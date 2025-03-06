<script setup lang="ts">
import { useDark } from '@vueuse/core'
import { RouterLink } from 'vue-router'

import LogoDark from '../../assets/logo-dark.svg'
import Logo from '../../assets/logo.svg'

const dark = useDark()
</script>

<template>
  <RouterLink
    to="/" flex="~ 1" w-full items-center
    gap-2 px-2 text-nowrap text-2xl outline-none
  >
    <template v-if="dark">
      <img :src="LogoDark" h-8 w-8>
    </template>
    <template v-else>
      <img :src="Logo" h-8 w-8>
    </template>
    <div font-cute>
      <span>アイリ</span>
    </div>
  </RouterLink>
</template>
