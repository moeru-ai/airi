<script setup lang="ts">
import Settings from '../Settings.vue'
</script>

<template>
  <header mb-1 w-full gap-2>
    <div flex="~ 1" w-full items-center gap-2 px-2 text-nowrap text-2xl>
      <div i-solar:cat-outline text="[#ed869d]" />
      <div font-cute>
        <span>アイリ</span>
      </div>
    </div>
    <Settings />
  </header>
</template>
