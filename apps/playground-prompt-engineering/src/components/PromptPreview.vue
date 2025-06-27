<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useCharacterPromptStore } from '../composables/useCharacterPrompt'

const characterPrompt = useCharacterPromptStore()
const { modules, completePrompt, includeExample } = storeToRefs(characterPrompt)

type ModuleId = 'core-identity' | 'personality' | 'speech' | 'emotion' | 'context' | 'example' | 'format' | 'complete'

// Track which modules are visible
const moduleVisibility = ref<Record<ModuleId, boolean>>({
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
function toggleModule(moduleId: ModuleId) {
  moduleVisibility.value[moduleId] = !moduleVisibility.value[moduleId]
}

// Get module content from characterPrompt
const moduleList = computed(() => {
  return [
    {
      id: 'core-identity' as ModuleId,
      title: 'Core Identity',
      content: modules.value.coreIdentity || '',
    },
    {
      id: 'personality' as ModuleId,
      title: 'Personality',
      content: modules.value.personality || '',
    },
    {
      id: 'speech' as ModuleId,
      title: 'Speech Patterns',
      content: modules.value.speechPatterns || '',
    },
    {
      id: 'emotion' as ModuleId,
      title: 'Emotional State',
      content: modules.value.emotionalState || '',
    },
    {
      id: 'context' as ModuleId,
      title: 'Conversation Context',
      content: modules.value.context || '',
    },
    {
      id: 'example' as ModuleId,
      title: 'Example',
      content: modules.value.example || '',
    },
    {
      id: 'format' as ModuleId,
      title: 'Response Format',
      content: modules.value.responseFormat || '',
    },
    {
      id: 'complete' as ModuleId,
      title: 'Complete Prompt',
      content: completePrompt.value || '',
    },
  ]
})

// Watch for includeExample changes to hide/show example module
watch(() => includeExample.value, (newValue) => {
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
    <div class="panel-header flex items-center justify-between rounded-t-lg bg-primary p-3 text-sm text-white font-normal">
      Prompt Preview
      <span class="text-xs">
        Total Tokens: <span class="rounded bg-white/20 px-1.5 py-0.5 font-normal">{{ estimateTokens(completePrompt || '') }}</span>
      </span>
    </div>

    <div class="panel-body max-h-[calc(100vh-13rem)] flex-1 overflow-y-auto p-4">
      <div v-for="(module, index) in moduleList" :key="index" class="mb-3">
        <div
          class="mb-2 flex cursor-pointer items-center justify-between text-sm text-gray font-normal hover:text-primary"
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
