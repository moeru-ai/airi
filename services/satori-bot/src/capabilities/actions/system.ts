import type { ActionHandler, ActionResult } from '../definition'

import { SLEEP_DURATION_MS } from '../../core/constants'
import { listChannels } from '../../lib/db'

// 1. Continue Action
export const continueAction: ActionHandler = {
  name: 'continue',
  execute: async (): Promise<ActionResult> => {
    return {
      success: true,
      shouldContinue: false,
      result: 'AIRI System: Acknowledged, will now wait for user input.',
    }
  },
}

// 2. Break Action
export const breakAction: ActionHandler = {
  name: 'break',
  execute: async (_ctx, chatCtx): Promise<ActionResult> => {
    chatCtx.messages = []
    chatCtx.actions = []
    return {
      success: true,
      shouldContinue: false,
      result: 'AIRI System: Memory cleared. Loop broken.',
    }
  },
}

// 3. Sleep Action
export const sleepAction: ActionHandler = {
  name: 'sleep',
  execute: async (_ctx, _chatCtx, args): Promise<ActionResult> => {
    const duration = args.duration || SLEEP_DURATION_MS
    await new Promise(resolve => setTimeout(resolve, duration))
    return {
      success: true,
      shouldContinue: true,
      result: `AIRI System: Slept for ${duration / 1000} seconds.`,
    }
  },
}

// 4. List Channels Action
export const listChannelsAction: ActionHandler = {
  name: 'list_channels',
  execute: async (): Promise<ActionResult> => {
    const channels = await listChannels()
    const list = channels.map(c => `ID:${c.id}, Name:${c.name}, Platform:${c.platform}`).join('\n')
    return {
      success: true,
      shouldContinue: true,
      result: `AIRI System: Channel List:\n${list}`,
    }
  },
}
