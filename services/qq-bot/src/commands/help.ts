import type { CommandHandler } from './types'

import { createTextResponse } from '../types/response'

export const helpCommand: CommandHandler = async (_event, _args, _context) => {
  const text = [
    'AIRI QQ Bot 可用命令：',
    '/help - 显示帮助',
    '/status - 查看运行状态',
    '/clear - 清空当前会话上下文',
  ].join('\n')
  return createTextResponse(text)
}
