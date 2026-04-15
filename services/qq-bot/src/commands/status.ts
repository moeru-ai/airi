import type { CommandHandler } from './types'

import { createTextResponse } from '../types/response'

export const statusCommand: CommandHandler = async (_event, _args, context) => {
  const uptimeSeconds = Math.floor((Date.now() - context.startedAt) / 1000)
  const text = [
    'AIRI QQ Bot 状态：',
    `运行时长：${uptimeSeconds}s`,
    `已处理消息：${context.processedCount}`,
  ].join('\n')
  return createTextResponse(text)
}
