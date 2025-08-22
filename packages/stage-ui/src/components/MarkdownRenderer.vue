<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

import { useMarkdown } from '../composables/markdown'

interface Props {
  content: string
  class?: string
}

const props = defineProps<Props>()

const processedContent = ref('')
const { process, processSync } = useMarkdown()

async function processContent() {
  if (!props.content) {
    processedContent.value = ''
    return
  }

  try {
    processedContent.value = await process(props.content)
  }
  catch (error) {
    console.warn('Failed to process markdown with syntax highlighting, using fallback:', error)
    processedContent.value = processSync(props.content)
  }
}

// Process content when it changes
watch(() => props.content, processContent, { immediate: true })

onMounted(() => {
  processContent()
})
</script>

<template>
  <div
    :class="props.class"
    class="markdown-content"
    v-html="processedContent"
  />
</template>

<style scoped>
.markdown-content :deep(pre) {
  overflow-x: auto;
  max-width: 100%;
  border-radius: 6px;
  padding: 1rem;
  margin: 0.5rem 0;
}

.markdown-content :deep(code) {
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 0.875em;
}

.markdown-content :deep(pre code) {
  display: block;
  width: fit-content;
  min-width: 100%;
}

/* Ensure horizontal scrolling for wide code blocks */
.markdown-content :deep(pre.shiki) {
  overflow-x: auto;
  white-space: pre;
}

.markdown-content :deep(.shiki) {
  border-radius: 6px;
  padding: 1rem;
  margin: 0.5rem 0;
}

/* Fallback styles for non-shiki code blocks */
.markdown-content :deep(pre:not(.shiki)) {
  background: #f6f8fa;
  border: 1px solid #d0d7de;
}

.dark .markdown-content :deep(pre:not(.shiki)) {
  background: #161b22;
  border: 1px solid #30363d;
}
</style>
