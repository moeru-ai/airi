<script setup lang="ts">
import { DrawerContent, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTrigger } from 'vaul-vue'

import MobileSettings from './MobileSettings.vue'
</script>

<template>
  <div flex="~" gap-2>
    <DrawerRoot should-scale-background direction="right">
      <DrawerTrigger
        bg="zinc-100 dark:zinc-800"
        text="lg zinc-500 dark:zinc-400"
        max-h="[10lh]" min-h="[1lh]"
        m-1 rounded-lg p-2 outline-none
      >
        <div i-solar:settings-minimalistic-bold-duotone />
      </DrawerTrigger>
      <DrawerPortal>
        <DrawerOverlay class="fixed inset-0 z-50 bg-black/40" />
        <DrawerContent
          max-w="[50%]" bg="[#fffbff] dark:[#1f1a1d]" fixed bottom-0 right-0 top-0 z-50 ml-24 h-full w-full
          flex flex-col overflow-y-scroll rounded-l-lg
        >
          <div class="flex flex-1 flex-col rounded-t-lg p-5" bg="[#fffbff] dark:[#1f1a1d]" gap-2>
            <MobileSettings />
          </div>
        </DrawerContent>
      </DrawerPortal>
    </DrawerRoot>
  </div>
</template>
