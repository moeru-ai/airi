import type { ExecutableTool } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import type { ChatToolReference } from '@proj-airi/stage-ui/types/chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { defineStore } from 'pinia'

import { computerUseTools } from './builtin/computer-use'
import { desktopAgentToolReferences, desktopAgentTools } from './builtin/desktop-agent'
import { imageJournalTools } from './builtin/image-journal'
import { weatherTools } from './builtin/weather'
import { widgetsTools } from './builtin/widgets'

export const computerUseToolReferences = [
  { name: 'computer_use' },
  { name: 'computer_use_read_image' },
] satisfies ChatToolReference[]

/**
 * The desktop agent tools.
 *
 * The request selects these by name, and the agent's master switch decides
 * whether that request carries them at all. They stay out of the default tool
 * list, so a conversation only reaches the local machine after the user turns
 * the agent on.
 */
export { desktopAgentToolReferences }

export const widgetToolReferences = [
  { name: 'stage_widgets' },
  { name: 'get_weather' },
] satisfies ChatToolReference[]

export const artistryToolReferences = [
  { name: 'image_journal' },
  ...widgetToolReferences,
] satisfies ChatToolReference[]

export const useTamagotchiBuiltinToolsStore = defineStore('tamagotchi-builtin-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const toolIdPrefix = 'tamagotchi:'

  function registeredToolIds() {
    return llmToolsStore.tools
      .filter(tool => tool.id.startsWith(toolIdPrefix))
      .map(tool => tool.id)
  }

  async function refresh() {
    const tools = (await Promise.all([
      imageJournalTools(),
      widgetsTools(),
      weatherTools(),
      computerUseTools(),
      desktopAgentTools(),
    ])).flat()

    llmToolsStore.removeToolsByIds(...registeredToolIds())
    llmToolsStore.addTools(...tools.map(tool => ({
      ...tool,
      defaultActive: false,
      requiresExplicitSelection: computerUseToolReferences.some(reference => reference.name === tool.function.name),
      id: `${toolIdPrefix}${tool.function.name}`,
    } satisfies ExecutableTool)))
  }

  return { refresh }
}, {
  synced: {
    actions: ['refresh'],
    state: false,
  },
})
