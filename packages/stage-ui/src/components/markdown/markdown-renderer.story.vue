<script setup lang="ts">
import { ref } from 'vue'

import MarkdownRenderer from './markdown-renderer.vue'

const markdownContent = ref(`
# Sample Markdown
This is a sample markdown content with a code block.
`)
</script>

<template>
  <Story
    title="MarkdownRenderer"
    group="widgets"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <Variant
      id="markdown-renderer"
      title="MarkdownRenderer"
    >
      <div h-auto w-full p-4>
        <MarkdownRenderer :content="markdownContent" />
      </div>
    </Variant>
  </Story>
</template>
