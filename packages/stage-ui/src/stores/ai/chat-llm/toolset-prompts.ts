import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface LlmToolsetPromptContribution {
  id: string
  title?: string
  content: string
}

function renderToolsetPrompts(prompts: LlmToolsetPromptContribution[]) {
  const activePrompts = prompts.filter(prompt => prompt.content.trim().length > 0)
  if (activePrompts.length === 0) {
    return ''
  }

  const lines = ['## Toolset', '']

  for (const prompt of activePrompts) {
    if (prompt.title) {
      lines.push(`### ${prompt.title}`, '')
    }

    lines.push(prompt.content.trim())
    lines.push('')
  }

  return lines.join('\n').trim()
}

export const useLlmToolsetPromptsStore = defineStore('llm-toolset-prompts', () => {
  const promptsByProvider = ref<Record<string, LlmToolsetPromptContribution[]>>({})

  function registerToolsetPrompts(provider: string, prompts: LlmToolsetPromptContribution[]) {
    promptsByProvider.value = {
      ...promptsByProvider.value,
      [provider]: structuredClone(prompts),
    }
  }

  function clearToolsetPrompts(provider: string) {
    const { [provider]: _removed, ...remaining } = promptsByProvider.value
    promptsByProvider.value = remaining
  }

  const activeToolsetPrompt = computed(() => renderToolsetPrompts(Object.values(promptsByProvider.value).flat()))

  return {
    activeToolsetPrompt,
    clearToolsetPrompts,
    promptsByProvider,
    registerToolsetPrompts,
  }
})
