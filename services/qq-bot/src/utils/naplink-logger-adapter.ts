// src/utils/naplink-logger-adapter.ts
// ─────────────────────────────────────────────────────────────
// 将内部 LoggerInstance 适配为 NapLink 的 Logger 接口。
// 唯一差异：NapLink error() 第二参数是可选 Error 对象，
// 我们将其合并到 args 透传给内部 logger。
// ─────────────────────────────────────────────────────────────

import type { Logger as NapLinkLogger } from '@naplink/naplink'

import type { LoggerInstance } from './logger'

import { createLogger } from './logger'

export class NapLinkLoggerAdapter implements NapLinkLogger {
  private logger: LoggerInstance

  constructor(logger?: LoggerInstance) {
    this.logger = logger ?? createLogger('naplink')
  }

  debug(msg: string, ...meta: unknown[]): void {
    this.logger.debug(msg, ...meta)
  }

  info(msg: string, ...meta: unknown[]): void {
    this.logger.info(msg, ...meta)
  }

  warn(msg: string, ...meta: unknown[]): void {
    this.logger.warn(msg, ...meta)
  }

  error(msg: string, error?: Error, ...meta: unknown[]): void {
    if (error) {
      this.logger.error(`${msg} — ${error.message}`, error, ...meta)
    }
    else {
      this.logger.error(msg, ...meta)
    }
  }
}
