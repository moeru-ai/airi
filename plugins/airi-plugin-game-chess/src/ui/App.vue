<script setup lang="ts">
import ChessBoard from './components/ChessBoard.vue'
</script>

<template>
  <div :class="['h-screen w-screen', 'flex items-center justify-center', 'bg-neutral-100']">
    <ChessBoard />
  </div>
</template>
