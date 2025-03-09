<script setup lang="ts">
import { useScreenSafeArea } from '@vueuse/core'
import { RouterView } from 'vue-router'

import HeaderLink from '../components/Layouts/HeaderLink.vue'

const { top, right, bottom, left } = useScreenSafeArea()
</script>

<template>
  <div
    p-2
    :style="{
      paddingTop: `${top}px`,
      paddingRight: `${right}px`,
      paddingBottom: `${bottom}px`,
      paddingLeft: `${left}px`,
    }"
  >
    <div mb-4 w-full gap-2 class="px-0 py-1 md:px-3 md:py-3">
      <HeaderLink />
    </div>
    <div class="px-3 py-2 md:px-5 md:py-5" flex="~ col gap-4">
      <RouterView />
    </div>
  </div>
</template>
