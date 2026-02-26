import type { ActionResult } from '../capabilities/definition'
import type { BotContext, ChatContext } from './types'

import { globalRegistry } from '../capabilities/registry'

export async function dispatchAction(
  ctx: BotContext,
  chatCtx: ChatContext,
  actionPayload: any,
  abortController: AbortController,
): Promise<ActionResult> {
  const log = ctx.logger.useGlobalConfig()

  if (!actionPayload || !actionPayload.action) {
    return {
      success: false,
      shouldContinue: true,
      result: 'System Error: No valid action name provided in JSON.',
    }
  }

  const handler = globalRegistry.get(actionPayload.action)

  if (!handler) {
    return {
      success: false,
      shouldContinue: true,
      result: `System Error: Action "${actionPayload.action}" is not implemented.`,
    }
  }

  try {
    log.withField('action', actionPayload.action).debug('Executing action')

    const result = await handler.execute(ctx, chatCtx, actionPayload, abortController.signal)

    chatCtx.actions.push({
      action: actionPayload,
      result: result.result,
    })

    return result
  }
  catch (error) {
    log.withError(error as Error).error('Action execution failed')
    return {
      success: false,
      shouldContinue: true,
      result: `System Error: Execution failed: ${(error as Error).message}`,
    }
  }
}
