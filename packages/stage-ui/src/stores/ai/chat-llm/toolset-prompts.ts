import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface LlmToolsetPromptContribution {
  id: string
  title?: string
  content: string
  /** Includes guidance only when the request grants every listed model-facing tool name. Omit for host-wide instructions. */
  requiredTools?: string[]
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

  // Host-wide instructions keep their existing composition path. Tool-scoped instructions follow request admission instead.
  const activeToolsetPrompt = computed(() => renderToolsetPrompts(Object.values(promptsByProvider.value).flat().filter(prompt => !prompt.requiredTools)))

  /** Resolves tool-scoped guidance without changing registrations or granting tools. */
  function getToolsetPromptForTools(toolNames: readonly string[]) {
    const granted = new Set(toolNames)
    return renderToolsetPrompts(Object.values(promptsByProvider.value).flat().filter(prompt =>
      prompt.requiredTools?.length && prompt.requiredTools.every(name => granted.has(name)),
    ))
  }

  return {
    activeToolsetPrompt,
    getToolsetPromptForTools,
    clearToolsetPrompts,
    promptsByProvider,
    registerToolsetPrompts,
  }
})
