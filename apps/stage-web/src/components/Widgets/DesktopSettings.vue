<script setup lang="ts">
import { DrawerContent, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTrigger } from 'vaul-vue'
import { ref } from 'vue'

import MobileSettings from './MobileSettings.vue'

const isOpen = ref(false)
</script>

<template>
  <div flex="~" gap-2>
    <DrawerRoot v-model:open="isOpen" should-scale-background direction="right">
      <DrawerTrigger
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        max-h="[10lh]" min-h="[1lh]"
        m-1 rounded-lg p-2 outline-none
      >
        <div i-solar:settings-minimalistic-bold-duotone />
      </DrawerTrigger>
      <DrawerPortal>
        <DrawerOverlay fixed inset-0 z-50 bg-black:40 />
        <DrawerContent
          class="max-w-40% min-w-500px w-full"
          flex="~ col"
          bg="white dark:neutral-900"
          fixed inset-y-4 right-4 z-50 of-hidden rounded-lg outline-none
        >
          <div flex="~ 1 col gap-2" of-y-scroll rounded-t-lg p-5>
            <MobileSettings />
          </div>
        </DrawerContent>
      </DrawerPortal>
    </DrawerRoot>
  </div>
</template>
