<script setup lang="ts">
import { useDark } from '@vueuse/core'
import { RouterLink } from 'vue-router'

import LogoDark from '../../assets/logo-dark.svg'
import Logo from '../../assets/logo.svg'

const dark = useDark()
</script>

<template>
  <header mb-1 w-full gap-2>
    <a
      href="https://github.com/moeru-ai/airi" rel="noreferrer noopener" target="_blank" flex="~ 1" w-full items-center
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
    </a>
    <RouterLink
      class="m-1 block max-h-[10lh] min-h-[1lh] rounded-lg bg-zinc-100 p-2 text-lg text-zinc-500 outline-none dark:bg-zinc-800 dark:text-zinc-400"
      to="/settings"
    >
      <div i-solar:settings-minimalistic-bold-duotone />
    </RouterLink>
  </header>
</template>
