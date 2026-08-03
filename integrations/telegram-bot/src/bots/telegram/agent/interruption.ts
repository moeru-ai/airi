import type { Message as LLMMessage } from '@xsai/shared-chat'
import type { Message } from 'grammy/types'

interface InterruptionParams {
  processingTime: number
  messageCount: number
  currentMessages: LLMMessage[]
  newMessages: Message[]
  chatId: string
}

export async function shouldInterruptProcessing(params: InterruptionParams): Promise<boolean> {
  // Base cases
  if (params.processingTime < 1000) {
    // Always allow very short processes to complete
    return false
  }

  if (params.processingTime > 30000) {
    // Interrupt very long processes
    return true
  }

  // Consider message volume
  const messageRatio = params.messageCount / 5 // normalize against baseline

  // Consider processing time
  const timeRatio = Math.min(params.processingTime / 10000, 1) // normalize against 10s baseline

  // Calculate interruption probability
  // More messages = higher chance to interrupt
  // Longer processing = lower chance to interrupt
  const interruptProbability = messageRatio * (1 - timeRatio)

  // Add some randomness to prevent predictable behavior
  return Math.random() < interruptProbability
}
