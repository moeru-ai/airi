// ⚠️ 决策 ①：PipelineContext, WakeReason, StageResult 已迁移到 types/context.ts
//    打破 event.ts ↔ stage.ts 循环依赖
import type { StageResult } from '../types/context'
import type { QQMessageEvent } from '../types/event'
import type { LoggerInstance } from '../utils/logger'

import { performance } from 'node:perf_hooks'

import { createLogger } from '../utils/logger'

// 阶段抽象基类
// 每个 Stage 单独定义自己的 config 接口（如 FilterConfig、WakeConfig），
// 由 Valibot schema 各段推断导出。基类不加泛型约束。
export abstract class PipelineStage {
  abstract readonly name: string // 阶段名（用于日志）
  protected logger!: LoggerInstance // 由 initLogger() 延迟初始化

  // ─── 构造函数 ───
  // 基类: constructor(protected config: unknown)
  // 子类: constructor(config: FilterConfig) { super(config); this.initLogger() }

  // ─── 抽象方法（子类必须实现） ───
  abstract execute(event: QQMessageEvent): Promise<StageResult>

  // ─── 模板方法（Runner 调用此方法而非直接调 execute()） ───

  /**
   * 串联计时 + 错误捕获，Runner 调此方法而非直接调 execute()。
   * 自动输出 debug 级别耗时日志：[DEBUG] [FilterStage] execute took 2.3ms
   */
  async run(event: QQMessageEvent): Promise<StageResult> {
    if (!this.logger)
      this.initLogger()
    const start = performance.now()
    try {
      const result = await this.execute(event)
      const durationMs = (performance.now() - start).toFixed(1)
      this.logger.debug(`execute took ${durationMs}ms`, { action: result.action, eventId: event.id })
      return result
    }
    catch (err) {
      const durationMs = (performance.now() - start).toFixed(1)
      this.logger.error(`execute failed after ${durationMs}ms`, err as Error)
      throw err // 由 Runner 统一 catch
    }
  }

  // ─── 受保护方法 ───

  /** 延迟初始化 logger（首次 run 时自动调用，或子类构造函数中手动调） */
  protected initLogger(): void {
    this.logger = createLogger(this.name)
  }
}
