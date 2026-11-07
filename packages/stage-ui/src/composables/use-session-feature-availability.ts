import type { SessionFeatureSetting } from '../components/scenarios/chat/session-feature-groups'

import { computed } from 'vue'

import { useLlmToolsStore } from '../stores/ai/chat-llm/tools'
import { useMcpStore } from '../stores/mcp'
import { useHomeAssistantStore } from '../stores/modules/home-assistant'
import { useStickersStore } from '../stores/modules/stickers'
import { useVisionStore } from '../stores/modules/vision'
import { useWebSearchStore } from '../stores/modules/web-search'

/** A capability that a conversation preference cannot configure or enable. */
export interface SessionFeatureBlocker {
  reason: 'stickers-empty' | 'search-disabled' | 'search-unconfigured' | 'vision-disabled' | 'vision-unconfigured' | 'vision-context-disabled' | 'mcp-unavailable' | 'tools-unavailable' | 'home-assistant-disabled' | 'home-assistant-unconfigured' | 'parent-restricted'
  settingsPath?: string
}

interface FeatureAvailability {
  /** Unconfigured optional integrations stay hidden unless the conversation already has an explicit choice. */
  visible: boolean
  blocker?: SessionFeatureBlocker
}

/** Reports service prerequisites separately from the defaults owned by module settings. */
export function useSessionFeatureAvailability(nativeWebSearch: () => boolean) {
  const tools = useLlmToolsStore()
  const mcp = useMcpStore()
  const stickers = useStickersStore()
  const vision = useVisionStore()
  const search = useWebSearchStore()
  const homeAssistant = useHomeAssistantStore()

  return computed<Record<SessionFeatureSetting, FeatureAvailability>>(() => {
    const hasTools = (group: string) => tools.tools.some(tool => tool.group === group)
    const mcpAvailable = hasTools('mcp')
    const pluginsAvailable = hasTools('plugins')
    const homeAssistantAvailable = hasTools('home-assistant')
    const nativeSearch = nativeWebSearch()
    const searchConfigured = search.activeApiKey.trim().length > 0
    let visionBlocker: SessionFeatureBlocker | undefined
    if (!vision.enabled)
      visionBlocker = { reason: 'vision-disabled', settingsPath: '/settings/modules/vision' }
    else if (!vision.configured)
      visionBlocker = { reason: 'vision-unconfigured', settingsPath: '/settings/modules/vision' }
    else if (!vision.useForChat)
      visionBlocker = { reason: 'vision-context-disabled', settingsPath: '/settings/modules/vision' }

    let homeAssistantBlocker: SessionFeatureBlocker | undefined
    if (!homeAssistant.enabled)
      homeAssistantBlocker = { reason: 'home-assistant-disabled', settingsPath: '/settings/modules/home-assistant' }
    else if (!homeAssistant.hasCredentials)
      homeAssistantBlocker = { reason: 'home-assistant-unconfigured', settingsPath: '/settings/modules/home-assistant' }
    else if (!homeAssistantAvailable)
      homeAssistantBlocker = { reason: 'tools-unavailable', settingsPath: '/settings/modules/home-assistant' }

    return {
      'reactions': { visible: true },
      'stickers': {
        visible: true,
        blocker: stickers.entries.length ? undefined : { reason: 'stickers-empty', settingsPath: '/settings/modules/stickers' },
      },
      'skills': { visible: true },
      'memory': { visible: true },
      'tasks': { visible: true },
      'screen': {
        visible: Boolean(vision.activeProvider || vision.activeModel),
        blocker: visionBlocker,
      },
      'tools.web-search': {
        visible: search.enabled || searchConfigured || nativeSearch,
        blocker: search.configured || nativeSearch
          ? undefined
          : { reason: searchConfigured ? 'search-disabled' : 'search-unconfigured', settingsPath: '/settings/modules/web-search' },
      },
      'tools.mcp': {
        visible: Boolean(mcp.serverCmd || mcp.connected || mcpAvailable),
        blocker: mcpAvailable ? undefined : { reason: 'mcp-unavailable', settingsPath: '/settings/modules/mcp' },
      },
      'tools.plugins': {
        visible: pluginsAvailable,
        blocker: pluginsAvailable ? undefined : { reason: 'tools-unavailable' },
      },
      'tools.home-assistant': {
        visible: homeAssistant.enabled || homeAssistant.hasCredentials || homeAssistantAvailable,
        blocker: homeAssistantBlocker,
      },
    }
  })
}
