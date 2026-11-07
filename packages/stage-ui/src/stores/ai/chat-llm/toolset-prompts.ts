import type { SessionToolGroup } from '@proj-airi/core-agent'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface LlmToolsetPromptContribution {
  id: string
  title?: string
  content: string
  /** Source group that must be allowed before these instructions enter a request. */
  group?: SessionToolGroup
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

  function promptFor(groups: readonly SessionToolGroup[]) {
    return renderToolsetPrompts(Object.values(promptsByProvider.value).flat().filter(prompt => groups.includes(prompt.group ?? 'application')))
  }

  return {
    promptFor,
    activeToolsetPrompt,
    clearToolsetPrompts,
    promptsByProvider,
    registerToolsetPrompts,
  }
})
