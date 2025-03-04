<script setup lang="ts">
import { useDark } from '@vueuse/core'

import LogoDark from '../../assets/logo-dark.svg'
import Logo from '../../assets/logo.svg'
import DesktopSettings from '../Widgets/DesktopSettings.vue'

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
    <DesktopSettings />
  </header>
</template>
