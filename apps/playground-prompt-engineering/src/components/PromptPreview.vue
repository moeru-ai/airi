<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useCharacterPrompt } from '../composables/useCharacterPrompt'

const characterPrompt = useCharacterPrompt()

// Track which modules are visible
const moduleVisibility = ref({
  'core-identity': true,
  'personality': false,
  'speech': false,
  'emotion': false,
  'context': false,
  'example': false,
  'format': false,
  'complete': false,
})

// Toggle module visibility
function toggleModule(moduleId: string) {
  moduleVisibility.value[moduleId] = !moduleVisibility.value[moduleId]
}

// Get module content from characterPrompt
const moduleList = computed(() => {
  return [
    {
      id: 'core-identity',
      title: 'Core Identity',
      content: characterPrompt.modules.value.coreIdentity,
    },
    {
      id: 'personality',
      title: 'Personality',
      content: characterPrompt.modules.value.personality,
    },
    {
      id: 'speech',
      title: 'Speech Patterns',
      content: characterPrompt.modules.value.speechPatterns,
    },
    {
      id: 'emotion',
      title: 'Emotional State',
      content: characterPrompt.modules.value.emotionalState,
    },
    {
      id: 'context',
      title: 'Conversation Context',
      content: characterPrompt.modules.value.context,
    },
    {
      id: 'example',
      title: 'Example',
      content: characterPrompt.modules.value.example,
    },
    {
      id: 'format',
      title: 'Response Format',
      content: characterPrompt.modules.value.responseFormat,
    },
    {
      id: 'complete',
      title: 'Complete Prompt',
      content: characterPrompt.completePrompt.value,
    },
  ]
})

// Watch for includeExample changes to hide/show example module
watch(() => characterPrompt.includeExample.value, (newValue) => {
  // If includeExample is false, hide the example module
  if (!newValue) {
    moduleVisibility.value.example = false
  }
})

// Estimate token count
function estimateTokens(text: string) {
  return characterPrompt.estimateTokens(text || '')
}
</script>

<template>
  <div class="panel flex flex-col rounded-lg bg-white shadow">
    <div class="panel-header bg-primary flex items-center justify-between rounded-t-lg p-3 text-sm text-white font-semibold">
      Prompt Preview
      <span class="text-xs">
        Total Tokens: <span class="rounded bg-white/20 px-1.5 py-0.5 font-semibold">{{ estimateTokens(characterPrompt.completePrompt.value || '') }}</span>
      </span>
    </div>

    <div class="panel-body max-h-[calc(100vh-13rem)] flex-1 overflow-y-auto p-4">
      <div v-for="(module, index) in moduleList" :key="index" class="mb-3">
        <div
          class="hover:text-primary mb-2 flex cursor-pointer items-center justify-between text-sm text-gray font-semibold"
          @click="toggleModule(module.id)"
        >
          {{ module.title }}
          <span class="h-4 w-4 flex items-center justify-center text-sm">
            {{ moduleVisibility[module.id] ? '▲' : '▼' }}
          </span>
        </div>

        <pre
          v-if="moduleVisibility[module.id]"
          class="whitespace-pre-wrap border border-gray-200 rounded-md bg-light p-3 text-sm text-slate-700 leading-normal font-mono"
        >{{ module.content }}</pre>
      </div>
    </div>
  </div>
</template>
