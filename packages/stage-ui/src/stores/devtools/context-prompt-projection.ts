import type { ContextBudgetLimits } from '@proj-airi/core-agent'
import type { Message } from '@xsai/shared-chat'

import type { ContextMessage } from '../../types/chat'
import type { SerializedProjectionBreakdown } from './context-projection'

import { resolveContextBudgetLimits } from '@proj-airi/core-agent'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { formatContextPromptText } from '../chat/context-prompt'
import { classifySerializedProjection, positiveTokenCount } from './context-projection'

export type {
  ContextProjectionGroup,
  ContextProjectionGroupKind,
  ContextProjectionSectionKind,
  SerializedProjectionBreakdown,
} from './context-projection'
export { groupProjectionSections, reportedWindowUsage } from './context-projection'

/** Model metadata captured with one provider projection. Token fields come from the catalog, not from bytes. */
export interface PromptProjectionRequest {
  model: string
  providerId?: string
  /** Present only when the model catalog reported a positive context window. */
  contextWindowTokens?: number
  modelMaxOutputTokens?: number
  requestedOutputTokens?: number
  /** Compaction scheduling threshold. `softLimitBytes` is a serialized-byte estimate, not occupancy. */
  budgetLimits: ContextBudgetLimits
}

/**
 * Token counts the provider reported for the latest completed request.
 * Estimated or missing usage is never stored here.
 */
export interface ReportedPromptUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  source: 'reported'
  capturedAt: number
}

/** Optional metadata passed with the provider messages for the active request. */
export interface ProviderProjectionCapture {
  model: string
  providerId?: string
  contextWindowTokens?: number
  modelMaxOutputTokens?: number
  requestedOutputTokens?: number
  budgetLimits?: ContextBudgetLimits
  /** The object measured for this request. Falls back to the display messages when omitted. */
  serializedProjection?: unknown
}

export interface PromptProjectionSnapshot {
  capturedAt: number
  sessionId: string
  message: string
  contexts: Record<string, ContextMessage[]>
  promptText: string
  promptMessage?: Message
  composedMessage?: Message[]
  /** True after a provider request projection replaces the display composition. */
  providerCaptured?: boolean
  request?: PromptProjectionRequest
  /** UTF-8 breakdown of the serialized projection. This is not a token count. */
  breakdown?: SerializedProjectionBreakdown
  reportedUsage?: ReportedPromptUsage
}

function projectionRequest(details: ProviderProjectionCapture): PromptProjectionRequest {
  const contextWindowTokens = positiveTokenCount(details.contextWindowTokens)
    ?? (details.budgetLimits?.source === 'provider-model-metadata'
      ? positiveTokenCount(details.budgetLimits.contextWindowTokens)
      : undefined)
  const modelMaxOutputTokens = positiveTokenCount(details.modelMaxOutputTokens)
  const requestedOutputTokens = positiveTokenCount(details.requestedOutputTokens)

  return {
    model: details.model,
    providerId: details.providerId,
    contextWindowTokens,
    modelMaxOutputTokens,
    requestedOutputTokens,
    budgetLimits: details.budgetLimits ?? resolveContextBudgetLimits({
      contextWindowTokens,
      modelMaxOutputTokens,
      requestedOutputTokens,
    }),
  }
}

function cloneValue<T>(value: T): T {
  try {
    return structuredClone(value)
  }
  catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

/**
 * Latest provider projection for the active chat request.
 *
 * Chat `send` runs in the speech-player window. The floating chat and the dedicated
 * chat window are followers, so this store is replicated across windows.
 */
export const useContextPromptProjectionStore = defineStore('devtools:context-prompt-projection', () => {
  const lastPromptProjection = ref<PromptProjectionSnapshot>()

  function capturePromptProjection(payload: {
    sessionId: string
    message: string
    contexts: Record<string, ContextMessage[]>
    promptMessage?: Message | null
    composedMessage?: Message[]
  }) {
    lastPromptProjection.value = {
      capturedAt: Date.now(),
      sessionId: payload.sessionId,
      message: payload.message,
      contexts: cloneValue(payload.contexts),
      promptText: formatContextPromptText(payload.contexts),
      promptMessage: payload.promptMessage ? cloneValue(payload.promptMessage) : undefined,
      composedMessage: payload.composedMessage ? cloneValue(payload.composedMessage) : undefined,
      providerCaptured: false,
    }
  }

  function captureProviderPromptProjection(sessionId: string, composedMessage: Message[], details?: ProviderProjectionCapture) {
    if (lastPromptProjection.value?.sessionId !== sessionId)
      return

    lastPromptProjection.value = {
      ...lastPromptProjection.value,
      capturedAt: Date.now(),
      composedMessage: cloneValue(composedMessage),
      providerCaptured: true,
      request: details ? projectionRequest(details) : lastPromptProjection.value.request,
      breakdown: classifySerializedProjection(details?.serializedProjection ?? composedMessage),
      // The previous request's reported tokens do not describe this projection.
      reportedUsage: undefined,
    }
  }

  /**
   * Records provider-reported tokens for the latest captured projection.
   * Estimated usage and usage for another session are ignored.
   */
  function recordReportedUsage(sessionId: string, usage: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    source: 'reported' | 'estimated' | 'unavailable'
  }) {
    if (usage.source !== 'reported')
      return
    if (lastPromptProjection.value?.sessionId !== sessionId || !lastPromptProjection.value.providerCaptured)
      return

    lastPromptProjection.value = {
      ...lastPromptProjection.value,
      reportedUsage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        source: 'reported',
        capturedAt: Date.now(),
      },
    }
  }

  return {
    lastPromptProjection,
    capturePromptProjection,
    captureProviderPromptProjection,
    recordReportedUsage,
  }
}, {
  synced: {
    state: true,
  },
})
