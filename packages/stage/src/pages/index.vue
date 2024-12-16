<script setup lang="ts">
// import BackgroundCross from '../components/Backgrounds/Cross.vue'
// import BackgroundCrossBlocks from '../components/Backgrounds/CrossBlocks.vue'
import BackgroundTicTacToe from '../components/Backgrounds/TicTacToe.vue'
// import BackgroundLine1 from '../components/Backgrounds/Line1.vue'
import Header from '../components/Layouts/Header.vue'
import ChatHistory from '../components/Widgets/ChatHistory.vue'
import Stage from '../components/Widgets/Stage.vue'
</script>

<template>
  <div h-full max-h="[100vh]" max-w="[100vw]" p="2" flex="~ col" overflow-hidden>
    <Header />
    <div flex="~ row 1" max-h="" relative h-full w-full items-end gap-2>
      <Stage />
      <BackgroundTicTacToe border="solid 2 pink-500" overflow-hidden rounded-full px-5 py-2>
        <div>
          ABCD
        </div>
      </BackgroundTicTacToe>
      <ChatHistory />
    </div>
  </div>
</template>

<route lang="yaml">
  meta:
    layout: default
  </route>
