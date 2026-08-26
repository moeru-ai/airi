import type { ActionResult } from '../capabilities/definition'
import type { BotContext, ChatContext } from './types'

import * as v from 'valibot'

import { globalRegistry } from '../capabilities/registry'
import { ActionSchema } from './types'

export async function dispatchAction(
  ctx: BotContext,
  chatCtx: ChatContext,
  actionPayload: unknown,
  abortController: AbortController,
): Promise<ActionResult> {
  const log = ctx.logger.useGlobalConfig()

  const parseResult = v.safeParse(ActionSchema, actionPayload)

  if (!parseResult.success) {
    return {
      success: false,
      shouldContinue: true,
      result: `System Error: Invalid action payload: ${parseResult.issues.map(i => i.message).join(', ')}`,
    }
  }

  const validatedAction = parseResult.output
  const handler = globalRegistry.get(validatedAction.action)

  if (!handler) {
    return {
      success: false,
      shouldContinue: true,
      result: `System Error: Action "${validatedAction.action}" is not implemented.`,
    }
  }

  try {
    log.withField('action', validatedAction.action).debug('Executing action')

    const result = await handler.execute(ctx, chatCtx, validatedAction, abortController.signal)

    chatCtx.actions.push({
      action: validatedAction,
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
