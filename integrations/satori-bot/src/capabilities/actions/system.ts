import type { ActionHandler, ActionResult } from '../definition'

import { SLEEP_DURATION_MS } from '../../core/constants'
import { listChannels } from '../../lib/db'

// 1. Continue Action
export const continueAction: ActionHandler = {
  execute: async (): Promise<ActionResult> => {
    return {
      result: 'AIRI System: Acknowledged, will now wait for user input.',
      shouldContinue: false,
      success: true,
    }
  },
  name: 'continue',
}

// 2. Break Action
export const breakAction: ActionHandler = {
  execute: async (_ctx, chatCtx): Promise<ActionResult> => {
    chatCtx.actions = []
    return {
      result: 'AIRI System: Memory cleared. Loop broken.',
      shouldContinue: false,
      success: true,
    }
  },
  name: 'break',
}

// 3. Sleep Action
export const sleepAction: ActionHandler = {
  execute: async (_ctx, _chatCtx, args): Promise<ActionResult> => {
    if (args.action !== 'sleep') {
      return {
        result: 'System Error: Action mismatch for sleep.',
        shouldContinue: true,
        success: false,
      }
    }
    const duration = args.duration || SLEEP_DURATION_MS
    await new Promise(resolve => setTimeout(resolve, duration))
    return {
      result: `AIRI System: Slept for ${duration / 1000} seconds.`,
      shouldContinue: true,
      success: true,
    }
  },
  name: 'sleep',
}

// 4. List Channels Action
export const listChannelsAction: ActionHandler = {
  execute: async (): Promise<ActionResult> => {
    const channels = await listChannels()
    const list = channels.map(c => `ID:${c.id}, Name:${c.name}, Platform:${c.platform}`).join('\n')
    return {
      result: `AIRI System: Channel List:\n${list}`,
      shouldContinue: true,
      success: true,
    }
  },
  name: 'list_channels',
}
