<script setup lang="ts">
import { Collapsable } from '@proj-airi/stage-ui/components'
import { ref } from 'vue'

interface ModelProvider {
  id: string
  name: string
  icon?: string
  models: {
    id: string
    name: string
    capabilities: string[]
  }[]
}

const providers = ref<ModelProvider[]>([
  {
    id: 'openai',
    name: 'OpenAI',
    icon: 'i-lobe-icons:openai',
    models: [
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', capabilities: ['chat', 'vision'] },
      { id: 'gpt-4', name: 'GPT-4', capabilities: ['chat'] },
      { id: 'whisper-1', name: 'Whisper', capabilities: ['stt'] },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: 'i-lobe-icons:openrouter',
    models: [
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', capabilities: ['chat', 'vision'] },
      { id: 'google/gemini-pro', name: 'Gemini Pro', capabilities: ['chat'] },
    ],
  },
])
</script>

<template>
  <div class="space-y-2">
    <div v-for="(provider) in providers" :key="provider.id">
      <Collapsable w-full>
        <template #trigger="slotProps">
          <button
            bg="zinc-100 dark:zinc-800"
            hover="bg-zinc-200 dark:bg-zinc-700"
            transition="all ease-in-out duration-250"
            w-full flex items-center gap-1.5 rounded-lg px-4 py-3
            @click="slotProps.setVisible(!slotProps.visible)"
          >
            <div flex="~ row 1" items-center gap-1.5>
              <div :class="provider.icon" class="size-6" />
              <div class="font-medium">
                {{ provider.name }}
              </div>
            </div>
            <div transform transition="transform duration-250" :class="{ 'rotate-180': slotProps.visible }">
              <div i-solar:alt-arrow-down-bold-duotone />
            </div>
          </button>
        </template>
        <div p-4>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div class="text-sm font-medium">
                API Key
              </div>
              <input
                class="rounded bg-zinc-200 px-2 py-1 text-sm dark:bg-zinc-800"
                placeholder="Enter API key"
              >
            </div>
            <div class="space-y-2">
              <div class="text-sm font-medium">
                Available Models
              </div>
            </div>
          </div>
        </div>
      </Collapsable>
    </div>
  </div>
</template>
