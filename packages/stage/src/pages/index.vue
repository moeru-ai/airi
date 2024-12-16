<script setup lang="ts">
import Header from '../components/Layouts/Header.vue'
import InteractiveArea from '../components/Layouts/InteractiveArea.vue'
import Stage from '../components/Widgets/Stage.vue'
</script>

<template>
  <div h-full max-h="[100vh]" max-w="[100vw]" p="2" flex="~ col" overflow-hidden>
    <Header />
    <div flex="~ row 1" relative h-full w-full items-end gap-2>
      <Stage w="50%" />
      <InteractiveArea w="50%" />
    </div>
  </div>
</template>

<route lang="yaml">
  meta:
    layout: default
  </route>
