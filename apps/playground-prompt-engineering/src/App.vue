<script setup lang="ts">
import { renderMarkdownString } from '@velin-dev/core/browser'
import { onMounted } from 'vue'

import ChatSimulator from './components/ChatSimulator.vue'
import ControlPanel from './components/ControlPanel.vue'
import Notification from './components/Notification.vue'
import PromptPreview from './components/PromptPreview.vue'
import CharacterPrompt from './prompts/CharacterPrompt.md?raw'

onMounted(async () => {
  // eslint-disable-next-line no-console
  console.log(await renderMarkdownString(CharacterPrompt))
})
</script>

<template>
  <div class="bg-bg min-h-screen text-dark">
    <div class="container grid grid-cols-1 mx-auto max-w-[1400px] gap-4 p-4 lg:grid-cols-[350px_1fr_1fr] md:grid-cols-[300px_1fr]">
      <ControlPanel />
      <PromptPreview />
      <ChatSimulator class="lg:col-span-1 md:col-span-2" />
    </div>
    <Notification />
  </div>
</template>
