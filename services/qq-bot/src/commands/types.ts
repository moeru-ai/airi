import type { QQMessageEvent } from '../types/event'
import type { ResponsePayload } from '../types/response'

export interface CommandContext {
  processedCount: number
  startedAt: number
}

export type CommandHandler = (
  event: QQMessageEvent,
  args: string[],
  context: CommandContext,
) => Promise<ResponsePayload>
