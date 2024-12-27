<script setup lang="ts">
import Header from '../components/Layouts/Header.vue'
import InteractiveArea from '../components/Layouts/InteractiveArea.vue'
import MobileHeader from '../components/Layouts/MobileHeader.vue'
import MobileInteractiveArea from '../components/Layouts/MobileInteractiveArea.vue'
import Stage from '../components/Widgets/Stage.vue'
</script>

<template>
  <div h-full max-h="[100vh]" max-w="[100vw]" p="2" flex="~ col" overflow-hidden>
    <Header class="flex <md:hidden" />
    <MobileHeader class="hidden <md:block" />
    <div flex="~ 1 row <md:col" relative h-full w-full items-end gap-2>
      <Stage h-full w-full flex-1 mb="<md:18" min-w="50%" />
      <InteractiveArea w="full <md:100%" h="full <md:40%" class="flex <md:hidden" />
      <MobileInteractiveArea w="full" class="md:hidden <md:flex" absolute bottom-0 />
    </div>
  </div>
</template>

<route lang="yaml">
  meta:
    layout: default
  </route>
