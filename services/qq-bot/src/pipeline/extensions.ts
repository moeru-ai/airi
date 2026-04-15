// src/pipeline/extensions.ts
// ─────────────────────────────────────────────────────────────
// 流水线扩展数据（PipelineExtensions）集中定义
//
// 功能：承载流水线各阶段之间需要共享的、不属于 PipelineContext
//       顶层字段的扩展数据。挂载于 PipelineContext.extensions。
//
// 设计依据：
//   - 替代被移除的 ResponsePayload.metadata（P5 YAGNI 决策），
//     阶段间共享数据统一走 extensions，不污染响应载荷。
//   - 强类型，不使用 index signature（Record<string, unknown>），
//     每个字段都有明确的类型定义和归属阶段标注。
//
// ─── 添加字段规则 ──────────────────────────────────────────
//
//   1. 每个字段必须标注：
//      - 写入方：哪个阶段负责写入
//      - 读取方：哪些阶段/模块会消费该字段
//      - 字段用途的一句话说明
//
//   2. 所有字段必须为可选（?:）——流水线可能在任意阶段中止，
//      后续阶段不保证执行，读取方必须处理 undefined。
//
//   3. 字段命名使用 camelCase，并以写入阶段的缩写作为前缀，
//      避免跨阶段命名冲突：
//        wake_   → WakeStage
//        rl_     → RateLimitStage
//        sess_   → SessionStage
//        proc_   → ProcessStage
//        dec_    → DecorateStage
//      如果字段由多个阶段共同写入，使用最先写入的阶段前缀。
//
//   4. 禁止存放可从 PipelineContext 顶层字段派生的数据
//      （如 isWakeUp、sessionHistory 已在顶层，不要重复）。
//
//   5. 禁止存放 ResponsePayload 相关的数据
//      （响应内容走 context.response，不走 extensions）。
//
// ─────────────────────────────────────────────────────────────

/**
 * 流水线阶段间共享的扩展数据。
 *
 * 当前为空接口 — 各阶段实现时按需驱动添加字段，
 * 遵循上方「添加字段规则」。
 */
export interface PipelineExtensions {
  // ─── WakeStage 写入 ───────────────────────────────────────

  // ─── RateLimitStage 写入 ──────────────────────────────────

  // ─── SessionStage 写入 ────────────────────────────────────

  // ─── ProcessStage 写入 ────────────────────────────────────

  // ─── DecorateStage 写入 ───────────────────────────────────

  // ─── Runner 注入（非阶段写入） ─────────────────────────────
  /** Bot QQ 号。Runner 在每次 run() 前注入，WakeStage 读取 */
  _botQQ?: string
}

/**
 * 创建 extensions 初始值（PipelineContext 初始化时调用）。
 * 所有字段均为可选，初始值为空对象。
 */
export function createExtensions(): PipelineExtensions {
  return {}
}
