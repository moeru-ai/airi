<script setup lang="ts">
import PoppingSubtitles from './PoppingSubtitles.vue'
</script>

<template>
  <Story
    title="Popping Subtitles"
    group="misc"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <Variant
      id="default"
      title="Default"
    >
      <PoppingSubtitles />
    </Variant>
  </Story>
</template>
