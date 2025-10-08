import type { ProcessingBatch } from '../background-trigger.js'
import type { StructuredLLMResponse } from '../llm-memory-manager.js'

export interface LLMProvider {
  /**
   * Process a batch of messages and return structured memory data
   */
  processBatch: (batch: ProcessingBatch) => Promise<StructuredLLMResponse>

  /**
   * Get provider name for logging/debugging
   */
  getProviderName: () => string
}
