<script setup lang="ts">
import Header from '../components/Layouts/Header.vue'
import ChatHistory from '../components/Widgets/ChatHistory.vue'
import InputArea from '../components/Widgets/InputArea.vue'
import Stage from '../components/Widgets/Stage.vue'
</script>

<template>
  <div h-full max-h="[100vh]" max-w="[100vw]" p="2" flex="~ col" overflow-hidden>
    <Header />
    <div flex="~ row 1" max-h="[calc(100vh-270px)] <sm:[calc(100vh-280px)]" relative h-full w-full items-end gap-2>
      <Stage />
      <ChatHistory />
    </div>
    <InputArea />
  </div>
</template>

<route lang="yaml">
  meta:
    layout: default
  </route>
