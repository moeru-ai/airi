// src/utils/logger.ts
// ─────────────────────────────────────────────────────────────
// 统一日志模块 — 两阶段初始化 + 注册表 + 彩色输出

import process from 'node:process'
//
// 设计依据：
//   - 两阶段初始化解决模块 import 时 config 尚未就绪的时序问题：
//     createLogger('ns') 立即返回可用实例（默认 info），
//     启动时 initLoggers(config) 遍历注册表统一更新级别。
//   - 格式：[HH:mm:ss.SSS] [LEVEL] [namespace] message
//   - 开发环境彩色输出（通过 NO_COLOR 环境变量控制）
//   - 兼容 NapLink Logger 接口（通过 NapLinkLoggerAdapter 适配）
// ─────────────────────────────────────────────────────────────

// ─── 级别定义 ───

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, off: 4 } as const
type LogLevel = keyof typeof LOG_LEVELS

// ─── 彩色输出 ───

const USE_COLOR = !process.env.NO_COLOR && process.stdout?.isTTY

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1B[90m', // gray
  info: '\x1B[36m', // cyan
  warn: '\x1B[33m', // yellow
  error: '\x1B[31m', // red
  off: '',
}
const RESET = '\x1B[0m'

// ─── 全局注册表 ───

const registry = new Set<LoggerInstance>()
let globalLevel: LogLevel = 'info'

// ─── LoggerInstance 类 ───

export class LoggerInstance {
  private level: LogLevel

  constructor(
    public readonly namespace: string,
    level?: LogLevel,
  ) {
    this.level = level ?? globalLevel
    registry.add(this)
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level]
  }

  private format(level: LogLevel, message: string): string {
    const now = new Date()
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad3(now.getMilliseconds())}`
    const tag = level.toUpperCase().padEnd(5)
    return `[${time}] [${tag}] [${this.namespace}] ${message}`
  }

  private output(level: LogLevel, message: string, args: unknown[]): void {
    if (!this.shouldLog(level))
      return
    const formatted = this.format(level, message)
    const fn = level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : console.info
    if (USE_COLOR) {
      fn(`${LEVEL_COLORS[level]}${formatted}${RESET}`, ...args)
    }
    else {
      fn(formatted, ...args)
    }
  }

  debug(msg: string, ...args: unknown[]) { this.output('debug', msg, args) }
  info(msg: string, ...args: unknown[]) { this.output('info', msg, args) }
  warn(msg: string, ...args: unknown[]) { this.output('warn', msg, args) }
  error(msg: string, ...args: unknown[]) { this.output('error', msg, args) }
}

function pad(n: number): string { return String(n).padStart(2, '0') }
function pad3(n: number): string { return String(n).padStart(3, '0') }

// ─── 公共 API ───

/** 创建带命名空间的 logger（立即可用，默认 info 级别） */
export function createLogger(namespace: string): LoggerInstance {
  return new LoggerInstance(namespace)
}

/**
 * 全局初始化：config 就绪后调用，刷新所有已创建实例的级别。
 * 支持多次调用（热重载场景）。
 */
export function initLoggers(config: { logging?: { level?: LogLevel } }): void {
  globalLevel = config.logging?.level ?? 'info'
  for (const logger of registry) {
    logger.setLevel(globalLevel)
  }
}

export type { LogLevel }
