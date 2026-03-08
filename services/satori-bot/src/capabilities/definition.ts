import type { Action, BotContext, ChatContext } from '../core/types'

export interface ActionResult {
  success: boolean
  shouldContinue: boolean
  result: unknown
}

export interface ActionHandler {
  name: string
  description?: string
  execute: (
    ctx: BotContext,
    chatCtx: ChatContext,
    args: Action,
    abortSignal?: AbortSignal,
  ) => Promise<ActionResult>
}
