// src/client.ts
// ─────────────────────────────────────────────────────────────
// NapLink 客户端工厂 & 生命周期管理
//
// 功能：创建并管理 NapLink WebSocket 客户端实例，
//       注册消息事件 → Normalizer → PipelineRunner 的处理链路，
//       提供优雅关闭（graceful shutdown）支持。
//
// 设计依据：
//   - 工厂函数模式（非 class）：createBot(config) 返回 Bot 接口，
//     避免 class 的继承复杂度，函数式组合更适合一次性初始化场景。
//     参考 NapLink 自身的 new NapLink(config) 模式，但在上层
//     用工厂封装，隐藏内部装配细节。
//   - Phase 1 仅注册 message.group 和 message.private 两类事件，
//     notice / request 等事件在后续 Phase 扩展。
//   - NapLink 日志注入：NapLink 内部 level 设为 'debug'（全量吐出），
//     实际过滤由 NapLinkLoggerAdapter 内部的 LoggerInstance 控制，
//     全局 logging.level 变更时（initLoggers）NapLink 日志也自动调整。
//   - botQQ 自动检测：connect 后通过 getLoginInfo() 获取，
//     config.botQQ 作为显式覆盖入口（可跳过一次 API 调用）。
//   - 进程信号处理：SIGINT / SIGTERM 触发 disconnect + 清理，
//     确保 WebSocket 正常关闭，NapCat 侧不残留半开连接。
//
// 依赖（→ 表示本文件调用的模块）：
//   → config.ts              — BotConfig 类型
//   → utils/logger.ts        — createLogger
//   → utils/naplink-logger-adapter.ts — NapLinkLoggerAdapter
//   → normalizer/index.ts    — normalizeGroupMessage, normalizePrivateMessage（待实现）
//   → pipeline/runner.ts     — PipelineRunner（待实现完整版）
//   → dispatcher/index.ts    — createDispatcher（待实现）
// ─────────────────────────────────────────────────────────────

import type {
  GroupMessageEvent,
  PokeNotice,
  PrivateMessageEvent,
} from '@naplink/naplink'

import type { BotConfig } from './config'

import process from 'node:process'

import { NapLink } from '@naplink/naplink'

import { createAiriClient } from './airi-client'
import { BailianEmbeddingProvider } from './context/embedding-provider'
import { SemanticRetriever } from './context/semantic-retriever'
import { ConversationRepo } from './db/conversation-repo'
import { initDb } from './db/index'
import { MessageHistoryRepo } from './db/message-history-repo'
import { createDispatcher } from './dispatcher'
import { normalizeGroupMessage, normalizePokeEvent, normalizePrivateMessage } from './normalizer'
import { PipelineRunner } from './pipeline/runner'
import { createLogger } from './utils/logger'
import { NapLinkLoggerAdapter } from './utils/naplink-logger-adapter'

// ─── 模块级 Logger ──────────────────────────────────────────
// client.ts 是顶层编排模块，日志命名空间 'client'，
// 与 NapLink 自身的 'naplink' 命名空间区分。

const logger = createLogger('client')

export function createNapLinkClient(config: BotConfig): NapLink {
  return new NapLink({
    ...config.naplink,
    logging: {
      ...config.naplink.logging,
      logger: new NapLinkLoggerAdapter(),
    },
  })
}

// ─── Bot 接口 ────────────────────────────────────────────────
//
// 功能：定义 createBot() 返回的公共契约。
// 设计依据：
//   - 最小暴露面原则：只暴露 connect / disconnect / client / botQQ。
//   - client（NapLink 实例）暴露给 Dispatcher 等需要直接调用
//     NapLink API（sendGroupMessage 等）的场景。
//   - botQQ 在 connect() 后填充，供 WakeStage 的 @bot 唤醒判断
//     和 Normalizer 的消息链处理（removeAtSegments）。
//   - 使用 interface 而非 type：语义更清晰（描述对象形状），
//     且 IDE hover 提示更友好。

export interface Bot {
  /** 连接到 NapCat 并开始处理消息。connect 后 botQQ 可用。 */
  connect: () => Promise<void>
  /** 断开连接并清理资源（同步操作，NapLink disconnect 是同步的）。 */
  disconnect: () => void
  /** NapLink 客户端实例引用（Dispatcher 使用，流水线内部不应直接访问）。 */
  readonly client: NapLink
  /** Bot QQ 号（字符串），connect() 后可用。connect 前为空字符串。 */
  readonly botQQ: string
}

// ─── 工厂函数 ────────────────────────────────────────────────
//
// 功能：组装 NapLink 客户端、Normalizer、PipelineRunner、Dispatcher，
//       注册事件监听，返回可启动的 Bot 对象。
//
// 设计依据：
//   - 工厂函数而非 class：一次性组装，不需要继承或多态。
//     闭包天然持有 config、client、runner 等内部状态，
//     Bot 接口只暴露必要的公共方法（信息隐藏）。
//   - 组装顺序：NapLink → Dispatcher → PipelineRunner → 事件注册。
//     依赖链决定顺序：Dispatcher 需要 NapLink client，
//     Runner 需要 config + Dispatcher，事件回调需要 Normalizer + Runner。
//   - 事件注册在 connect() 调用之前完成：NapLink connect() 返回后
//     立即开始触发缓冲的事件，提前注册确保不丢失连接后的首批消息。
//
// @param config - 完整的 BotConfig（已通过 Valibot 验证 + 默认值填充）
// @returns Bot 实例（调用 connect() 后开始工作）

export async function createBot(config: BotConfig): Promise<Bot> {
  // ━━━ 步骤 1：创建 NapLink 实例 ━━━━━━━━━━━━━━━━━━━━━━━━━━
  //
  // 功能：实例化 NapLink WebSocket 客户端。
  // 设计依据：
  //   - 透传 config.naplink 的所有字段（connection、reconnect、api），
  //     NapLink 内部据此管理连接、重连、心跳、API 超时。
  //   - logging.logger 注入 NapLinkLoggerAdapter：
  //     NapLink level 设为 config 中的值（默认 'debug'，全量吐出），
  //     适配器内部的 LoggerInstance('naplink') 按全局 logging.level 过滤。
  //     这样 initLoggers(config) 刷新级别后，NapLink 日志也自动调整，
  //     无需重建 NapLink 实例或重连 WebSocket。
  //   - 展开 config.naplink.logging 并覆盖 logger 字段：
  //     保留用户可能在 YAML 中配置的 NapLink logging.level，
  //     同时注入自定义 logger。

  const client = createNapLinkClient(config)
  const airiConfig = config.airi ?? {
    url: 'ws://localhost:6121/ws',
    token: undefined,
  }

  // ━━━ 步骤 2：创建 Dispatcher ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //
  // 功能：Dispatcher 持有 NapLink client 引用，封装消息发送逻辑
  //       （sendGroupMessage / sendPrivateMessage / sendForward）。
  // 设计依据：
  //   - 在 PipelineRunner 之前创建：RespondStage 需要 Dispatcher
  //     来发送最终响应，Runner 构造时将 Dispatcher 传给 RespondStage。
  //   - createDispatcher 是工厂函数（与 createBot 同模式），
  //     接收 NapLink client 作为唯一依赖。

  const dispatcher = createDispatcher(client, config.respond)
  const airiClient = createAiriClient(airiConfig.url, airiConfig.token)
  const db = await initDb(config.db?.path ?? 'data/qq-bot.db')
  const messageHistoryRepo = new MessageHistoryRepo(db)
  const conversationRepo = new ConversationRepo(db)

  const embeddingConfig = config.embedding ?? {
    enabled: true,
    provider: 'bailian' as const,
    apiKey: undefined,
    model: 'text-embedding-v4',
    dimension: 1024,
  }
  const semanticConfig = config.semanticRetrieval ?? {
    enabled: true,
    topK: 5,
  }

  let semanticRetriever: SemanticRetriever | undefined
  if (embeddingConfig.enabled && semanticConfig.enabled) {
    if (embeddingConfig.provider === 'bailian' && embeddingConfig.apiKey) {
      semanticRetriever = new SemanticRetriever(
        new BailianEmbeddingProvider(embeddingConfig.apiKey, {
          model: embeddingConfig.model,
          dimension: embeddingConfig.dimension,
        }),
        db,
      )
    }
    else {
      logger.warn('Semantic retrieval enabled but embedding provider is not fully configured, feature will be disabled')
    }
  }

  // ━━━ 步骤 3：创建 PipelineRunner ━━━━━━━━━━━━━━━━━━━━━━━━━
  //
  // 功能：组装 7 阶段流水线（Filter → Wake → RateLimit → Session →
  //       Process → Decorate → Respond），提供 run(event) 入口。
  // 设计依据：
  //   - Runner 接收完整 config + dispatcher：
  //     各 Stage 从 config 的对应子段获取自己的配置，
  //     RespondStage 额外需要 dispatcher 发送消息。
  //   - Runner 的生命周期与 Bot 一致（闭包持有），
  //     不支持运行时替换 Stage（配置热重载通过重建 Runner 实现，
  //     但当前 Phase 不实现热重载——YAGNI）。

  const runner = new PipelineRunner(
    config,
    airiClient,
    dispatcher,
    messageHistoryRepo,
    conversationRepo,
    semanticRetriever,
  )
  await runner.preheatPassiveRecords(await runner.listKnownSessionIds())

  // ━━━ 步骤 4：内部状态 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //
  // _botQQ 通过闭包持有，connect() 后通过 getBotQQ() 填充。
  // Bot 接口通过 getter 暴露为只读属性。
  // 初始为空字符串（而非 undefined）：
  //   - 避免下游做 null check，string 类型始终一致
  //   - connect() 前调用 bot.botQQ 返回 '' 而非报错，
  //     调用方可通过 bot.botQQ === '' 判断是否已连接

  let _botQQ = ''

  // ━━━ 步骤 5：getBotQQ — 自动检测 Bot QQ 号 ━━━━━━━━━━━━━━
  //
  // 功能：获取当前登录的 Bot QQ 号，供 WakeStage 和 Normalizer 使用。
  // 设计依据：
  //   - 优先使用 config.botQQ（显式配置跳过 API 调用，
  //     适用于测试环境或多账号场景）。
  //   - 否则调用 NapLink getLoginInfo()：
  //     返回 { user_id: number, nickname: string }，
  //     取 user_id 并 String() 转为字符串。
  //   - 必须在 client.connect() 之后调用——NapLink 需先建立
  //     WebSocket 连接才能发送 OneBot get_login_info action。
  //   - user_id 转 string 原因：QQ 号虽然目前不超过 JS 安全整数
  //     范围（Number.MAX_SAFE_INTEGER = 2^53 - 1），但统一用 string
  //     与 EventSource.userId、AtSegment.data.qq 类型对齐，
  //     避免跨模块的 number/string 转换噪音。

  async function getBotQQ(): Promise<string> {
    if (config.botQQ) {
      logger.info(`Using configured botQQ: ${config.botQQ}`)
      return config.botQQ
    }

    logger.info('botQQ not configured, detecting via getLoginInfo()...')
    const loginInfo = await client.getLoginInfo()
    const qq = String(loginInfo.user_id)
    logger.info(`Detected botQQ: ${qq} (nickname: ${loginInfo.nickname})`)
    return qq
  }

  // ━━━ 步骤 6：注册消息事件 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //
  // 功能：监听 NapLink 的 message.group 和 message.private 事件，
  //       将事件 data 通过 Normalizer 标准化为 QQMessageEvent，
  //       然后交给 PipelineRunner 执行 7 阶段处理。
  //
  // 设计依据：
  //   - Phase 1 仅处理消息事件（message.group + message.private）：
  //     这是 bot 的核心功能，notice（戳一戳、成员变动等）和
  //     request（好友/入群申请）在后续 Phase 扩展。
  //   - 事件回调内 try-catch 错误隔离：
  //     单条消息处理失败（Normalizer 异常、Stage 异常、LLM 超时等）
  //     不应崩溃整个 bot 进程。只记录错误日志，继续处理后续消息。
  //     参考 AstrBot 的事件循环：except Exception 捕获后 log + continue。
  //   - Normalizer 在回调内调用（而非 Runner 内部）：
  //     职责分离 — client.ts 负责「从 NapLink 拿到数据并标准化」，
  //     Runner 的 run() 只接收统一的 QQMessageEvent，不感知 NapLink。
  //     这使 Runner 可被独立测试（传入 mock QQMessageEvent）。
  //   - _botQQ 通过闭包传递给 Normalizer：
  //     Normalizer 需要 botQQ 来处理 @bot 消息段。
  //     时序安全：事件回调在 connect() 后才触发，
  //     而 _botQQ 在 connect() 中已通过 getBotQQ() 填充。

  function registerEvents(): void {
    // ── 群聊消息处理 ──
    // NapLink 'message.group' 事件回调参数 data 类型为
    // GroupMessageEventData（含 group_id, user_id, message, raw_message 等）。
    // normalizeGroupMessage 将其映射为 QQMessageEvent（source.type = 'group'）。
    client.on('message.group', async (data) => {
      try {
        const event = normalizeGroupMessage(data as GroupMessageEvent, _botQQ)
        await runner.run(event)
      }
      catch (err) {
        logger.error('Failed to process group message', err as Error)
      }
    })

    // ── 私聊消息处理 ──
    // NapLink 'message.private' 事件回调参数 data 类型为
    // PrivateMessageEventData（含 user_id, message, raw_message 等，无 group_id）。
    // normalizePrivateMessage 将其映射为 QQMessageEvent（source.type = 'private'）。
    client.on('message.private', async (data) => {
      try {
        const event = normalizePrivateMessage(data as PrivateMessageEvent, _botQQ)
        await runner.run(event)
      }
      catch (err) {
        logger.error('Failed to process private message', err as Error)
      }
    })

    // Phase 5: 戳一戳事件（仅戳 bot 自己时触发）
    client.on('notice.notify.poke', async (data) => {
      try {
        const event = normalizePokeEvent(data as PokeNotice, _botQQ)
        if (!event)
          return
        await runner.run(event)
      }
      catch (err) {
        logger.error('Failed to process poke event', err as Error)
      }
    })

    logger.debug('Message event handlers registered (message.group, message.private)')
  }

  // ━━━ 步骤 7：注册生命周期事件 ━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //
  // 功能：监听 NapLink 连接 / 断开 / 重连事件，输出状态日志。
  // 设计依据：
  //   - connect / disconnect / reconnecting 是 NapLink EventEmitter
  //     内置的生命周期事件（见 NapLink 事件文档）。
  //   - 仅做日志输出，不干预 NapLink 的自动重连机制：
  //     重连策略由 config.naplink.reconnect 控制（指数退避、最大次数等），
  //     NapLink 内部自行管理，我们不需要手动触发。
  //   - 不监听 meta_event.heartbeat：NapLink 已内置心跳管理，
  //     额外监听只会在 debug 日志中产生高频噪音（默认 30s 一次）。
  //   - disconnect 用 warn 级别：断连通常需要关注（网络问题、NapCat 崩溃等），
  //     但如果是主动调用 bot.disconnect() 则为预期行为，warn 不过分。

  function registerLifecycleEvents(): void {
    client.on('connect', () => {
      logger.info('WebSocket connected to NapCat')
    })

    client.on('disconnect', () => {
      logger.warn('WebSocket disconnected from NapCat')
    })

    client.on('reconnecting', () => {
      logger.info('Attempting to reconnect to NapCat...')
    })
  }

  // ━━━ 步骤 8：优雅关闭（Graceful Shutdown）━━━━━━━━━━━━━━━
  //
  // 功能：注册 SIGINT (Ctrl+C) 和 SIGTERM (kill / PM2 stop) 处理器，
  //       在进程退出前断开 NapLink 连接。
  //
  // 设计依据：
  //   - 不调 disconnect 直接退出的后果：
  //     NapCat 侧 WebSocket 连接进入 CLOSE_WAIT / 半开状态，
  //     占用连接资源直到超时清理（默认可能数分钟）。
  //     对于 NapCat 只允许单个 bot 连接的部署模式，
  //     这会导致新 bot 实例无法立即连接。
  //   - process.once() 而非 process.on()：
  //     防止用户快速连按 Ctrl+C 导致 shutdown 函数重复执行，
  //     第二次 Ctrl+C 触发 Node.js 默认行为（强制退出）。
  //   - process.exit(0)：
  //     NapLink disconnect() 是同步方法（关闭 WebSocket 并清理定时器），
  //     不需要 await。exit(0) 确保 Node.js 事件循环终止，
  //     不会因残留的 setInterval（如心跳检测）阻止进程退出。
  //   - 参考 NapLink 最佳实践文档的 PM2 部署方案：
  //     PM2 stop 发送 SIGINT 给子进程，bot 响应信号执行清理。

  function setupGracefulShutdown(): void {
    const shutdown = (signal: string) => {
      logger.info(`Received ${signal}, shutting down...`)
      try {
        client.disconnect()
        logger.info('NapLink client disconnected')
      }
      catch (err) {
        // disconnect 失败不应阻止进程退出
        // 可能原因：WebSocket 已关闭、NapCat 已不可达
        logger.error('Error during disconnect', err as Error)
      }
      process.exit(0)
    }

    process.once('SIGINT', () => shutdown('SIGINT'))
    process.once('SIGTERM', () => shutdown('SIGTERM'))
  }

  // ━━━ 步骤 9：组装 & 事件注册 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //
  // 设计依据：
  //   - 事件注册在工厂函数内完成（而非 connect() 内）：
  //     NapLink connect() 返回的 Promise resolve 后立即开始
  //     触发缓冲的事件，如果在 connect() 后才注册监听器，
  //     可能丢失连接后的首批消息。
  //   - 注册顺序：消息事件 → 生命周期事件 → 信号处理。
  //     消息事件最先注册，确保就绪；生命周期事件次之（日志用途）；
  //     信号处理最后（仅影响进程退出流程）。

  registerEvents()
  registerLifecycleEvents()
  setupGracefulShutdown()

  // ━━━ 步骤 10：返回 Bot 接口 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //
  // 闭包持有 client、runner、dispatcher、_botQQ 等内部状态，
  // Bot 接口只暴露 4 个成员，实现信息隐藏。
  // getter 保证 client 和 botQQ 为只读（外部无法 bot.botQQ = 'xxx'）。

  return {
    async connect() {
      logger.info('Connecting to NapCat...')

      // NapLink connect() 建立 WebSocket 连接，
      // 等待 OneBot lifecycle.connect 元事件确认连接成功。
      // 失败时抛出 ConnectionError（由调用方 index.ts catch 处理）。
      await client.connect()

      // 连接成功后获取 botQQ —— 必须在 connect 之后，
      // 因为 getLoginInfo 需要通过已建立的 WebSocket 发送 action。
      _botQQ = await getBotQQ()
      runner.setBotQQ(_botQQ)

      logger.info(`Bot is ready (QQ: ${_botQQ})`)
    },

    disconnect() {
      logger.info('Manual disconnect requested')
      client.disconnect()
      logger.info('Disconnected')
    },

    get client() {
      return client
    },

    get botQQ() {
      return _botQQ
    },
  }
}

export function createClient(config: BotConfig): NapLink {
  return createNapLinkClient(config)
}
