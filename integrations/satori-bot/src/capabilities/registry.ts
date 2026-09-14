import type { SatoriClient } from '../adapter/satori/client'
import type { ActionHandler } from './definition'

import { readMessagesAction } from './actions/read-messages'
import { createSendMessageAction } from './actions/send-message'
import { breakAction, continueAction, listChannelsAction, sleepAction } from './actions/system'
// import { createReadMessagesAction } ...

export class ActionRegistry {
  private actions = new Map<string, ActionHandler>()

  register(handler: ActionHandler) {
    this.actions.set(handler.name, handler)
  }

  get(name: string): ActionHandler | undefined {
    return this.actions.get(name)
  }

  // 提供一个批量加载的方法
  loadStandardActions(client: SatoriClient) {
    // 注册不需要依赖的系统 Action
    this.register(continueAction)
    this.register(breakAction)
    this.register(sleepAction)
    this.register(listChannelsAction)

    // 注册需要注入依赖的 Action
    this.register(createSendMessageAction(client))
    this.register(readMessagesAction)
  }
}

export const globalRegistry = new ActionRegistry()
