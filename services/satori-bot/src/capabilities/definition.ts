import type { BotContext, ChatContext } from '../core/types'

export interface ActionResult {
  success: boolean
  shouldContinue: boolean
  result: any
}

export interface ActionHandler {
  name: string
  description?: string
  execute: (
    ctx: BotContext,
    chatCtx: ChatContext,
    args: any,
    abortSignal?: AbortSignal,
  ) => Promise<ActionResult>
}
