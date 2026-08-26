import type { Action, BotContext, ChatContext } from '../core/types'

export interface ActionHandler {
  description?: string
  execute: (
    ctx: BotContext,
    chatCtx: ChatContext,
    args: Action,
    abortSignal?: AbortSignal,
  ) => Promise<ActionResult>
  name: string
}

export interface ActionResult {
  result: unknown
  shouldContinue: boolean
  success: boolean
}
