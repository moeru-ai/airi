import type { CommandHandler } from './types'

import { createTextResponse } from '../types/response'

// NOTICE: 实际清理动作由 PipelineRunner 在发送前根据
// event.context.extensions._clearSession 统一执行。
export const clearCommand: CommandHandler = async (_event, _args, _context) => {
  return createTextResponse('已清除当前会话上下文。')
}
