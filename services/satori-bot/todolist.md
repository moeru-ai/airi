# Satori Bot 待办事项 (优化版)

## 🟡 P1: 架构完善与逻辑优化 (性能与体验)

### 1. 重构 Action 截断逻辑，防止上下文失忆
**目标**: 确保 LLM 的历史记录截断不会破坏逻辑链（如 `send_message` + `continue`）。
- [ ] **策略层 (进阶)**:
    - [ ] 尝试将较旧的 `actions` 压缩为文本 Summary 存入 LLM Context，而非直接丢弃。

## 🟢 P2: 增强功能与类型安全

- [ ] **监控增强**:
    - [ ] 为所有 Action 执行增加更详细的 Trace 日志。
- [ ] **类型收紧**:
    - [ ] 持续检查并消除残留的 `as any` 类型断言。

---

## ✅ 已完成事项 (归档)

### 🛡️ 1. 核心稳定性与并发架构 (P0)
- [x] **修复短时记忆清理的竞态条件**: 实现基于 ID 的精准删除，防止异步消息丢失。
- [x] **消除全局锁死锁**: 将锁粒度下放到 Channel 级别，并引入 `try...finally` 强制释放机制。
- [x] **实现非阻塞调度**: `onMessageArrival` 与周期性任务改为并发执行，提升吞吐量。

### ⚙️ 2. 逻辑链完整性与体验优化 (P1)
- [x] **智能 Action 截断**: 实现 `trimActions` 自动回溯，防止截断破坏 `continue` 等成对逻辑链。
- [x] **阻断 API 滥用**: 在 `handleLoopStep` 中增加 `MAX_LOOP_ITERATIONS = 5` 的硬性上限。

### 💎 3. 类型安全与基础设施 (P2)
- [x] **修复 Satori API 类型不匹配**: 使 `SatoriMessageCreateResponse` 的接口定义与运行时 Schema 保持一致。
- [x] **移除全局暴力退出**: 在 `process.on('unhandledRejection')` 中移除 `process.exit(1)`。
- [x] **消除 Any 类型滥用**: 修复了 LLM 解析、数据库 Schema 等多处的类型退化。
- [x] **重写队列持久化 I/O**: 实现 Drizzle ORM 的增量更新模式。
