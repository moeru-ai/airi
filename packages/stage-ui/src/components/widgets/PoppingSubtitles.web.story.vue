<script setup lang="ts">
// import { ref } from 'vue'

import PoppingSubtitles from './PoppingSubtitles.web.vue'

// const sampleTexts = {
//   english: 'Hello, world!',
//   chinese: '你好，世界！',
//   japanese: 'こんにちは、世界！',
//   long: 'This is a longer sentence that might wrap to multiple lines and test our ellipsis functionality.',
// }
</script>

<template>
  <Story
    title="Popping Subtitles"
    group="widgets"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="basic-english"
      title="English Text"
    >
      <div h-50 w-50 p-4>
        <PoppingSubtitles />
      </div>
    </Variant>
  </Story>
</template>
