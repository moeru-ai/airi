import type { VisionAnalysisResult } from '../types'

import { useI18n } from 'vue-i18n'

import { useChatOrchestratorStore } from '../stores/chat'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useProvidersStore } from '../stores/providers'

export interface UseVisionChatIntegrationOptions {
  onError?: (error: Error) => void
}

export interface UseVisionChatIntegrationReturn {
  sendToAiriWithVision: (result: VisionAnalysisResult) => Promise<void>
}

export function useVisionChatIntegration(_options?: UseVisionChatIntegrationOptions): UseVisionChatIntegrationReturn {
  const { t } = useI18n()

  async function sendToAiriWithVision(result: VisionAnalysisResult): Promise<void> {
    try {
      const chatOrchestrator = useChatOrchestratorStore()
      const consciousnessStore = useConsciousnessStore()
      const providersStore = useProvidersStore()

      const { activeProvider, activeModel } = consciousnessStore
      const providerConfig = providersStore.getProviderConfig(activeProvider)

      const elementsList = result.elements.length > 0
        ? result.elements.map(el => `- [${el.type}] ${el.description} (${t('pages.modules.vision.analysis.position')} ${el.position.x}, ${el.position.y})`).join('\n')
        : t('pages.modules.vision.analysis.none')

      const suggestionsList = result.suggestions?.length
        ? result.suggestions.map(s => `- ${s}`).join('\n')
        : t('pages.modules.vision.analysis.none')

      const visionContext = `
${t('pages.modules.vision.analysis.context-header')}

**${t('pages.modules.vision.analysis.screen-description')}** ${result.description}

**${t('pages.modules.vision.analysis.ui-elements')}**
${elementsList}

**${t('pages.modules.vision.analysis.suggestions')}**
${suggestionsList}

${t('pages.modules.vision.analysis.prompt-footer')}
`.trim()

      const chatProvider = await providersStore.getProviderInstance(activeProvider) as any

      await chatOrchestrator.ingest(visionContext, {
        model: activeModel,
        chatProvider,
        providerConfig,
      })
    }
    catch (e) {
      console.error('[Vision] Failed to send to AIRI:', e)
    }
  }

  return {
    sendToAiriWithVision,
  }
}
