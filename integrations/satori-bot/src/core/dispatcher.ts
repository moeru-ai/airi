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
      result: `System Error: Invalid action payload: ${parseResult.issues.map(i => i.message).join(', ')}`,
      shouldContinue: true,
      success: false,
    }
  }

  const validatedAction = parseResult.output
  const handler = globalRegistry.get(validatedAction.action)

  if (!handler) {
    return {
      result: `System Error: Action "${validatedAction.action}" is not implemented.`,
      shouldContinue: true,
      success: false,
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
      result: `System Error: Execution failed: ${(error as Error).message}`,
      shouldContinue: true,
      success: false,
    }
  }
}
