// src/index.ts
// ─────────────────────────────────────────────────────────────
// 入口：初始化所有模块，启动 NapLink 连接
// ─────────────────────────────────────────────────────────────

import type {
  GroupMessageEvent,
  PokeNotice,
  PrivateMessageEvent,
} from '@naplink/naplink'

import process from 'node:process'

import { AgentLoop } from './agent/loop.js'
import { createAiriClient } from './airi-client.js'
import { createNapLinkClient } from './client.js'
import { loadConfig } from './config.js'
import { BailianEmbeddingProvider } from './context/embedding-provider.js'
import { SemanticRetriever } from './context/semantic-retriever.js'
import { ConversationRepo } from './db/conversation-repo.js'
import { initDb } from './db/index.js'
import { MessageHistoryRepo } from './db/message-history-repo.js'
import { createDispatcher } from './dispatcher/index.js'
import {
  normalizeGroupMessage,
  normalizePokeEvent,
  normalizePrivateMessage,
} from './normalizer/index.js'
import { PipelineRunner } from './pipeline/runner.js'
import { BotMessageTracker } from './utils/bot-message-tracker.js'
import { createLogger, initLoggers } from './utils/logger.js'

async function main() {
  // ─── 加载配置 ──────────────────────────────────────────────
  const config = await loadConfig()

  // ─── 初始化日志（阶段二：刷新全部 logger 实例） ────────────
  initLoggers(config)
  const logger = createLogger('main')
  logger.info('Config loaded, loggers initialized')

  const airiConfig = config.airi ?? {
    url: 'ws://localhost:6121/ws',
    token: undefined,
  }
  const dbConfig = config.db ?? {
    path: 'data/qq-bot.db',
    maxHistoryRows: 500,
    pruneIntervalMs: 3_600_000,
  }

  // ─── 创建 AIRI 连接 ────────────────────────────────────────
  const airiClient = createAiriClient(airiConfig.url, airiConfig.token)
  logger.info(`Connecting to AIRI server: ${airiConfig.url}`)

  // ─── 初始化 NapLink ────────────────────────────────────────
  const client = createNapLinkClient(config)

  // ─── 初始化持久化存储 ──────────────────────────────────────
  const db = await initDb(dbConfig.path)
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

  // ─── 创建 Pipeline Runner ──────────────────────────────────
  const botMessageTracker = new BotMessageTracker()
  const dispatcher = createDispatcher(client, config.respond, botMessageTracker)
  const runner = new PipelineRunner(
    config,
    airiClient,
    dispatcher,
    messageHistoryRepo,
    conversationRepo,
    semanticRetriever,
    botMessageTracker,
  )
  await runner.preheatPassiveRecords(await runner.listKnownSessionIds())

  let agentLoop: AgentLoop | undefined
  if (config.agentLoop?.enabled) {
    agentLoop = new AgentLoop(
      config.agentLoop,
      runner.getPassiveRecordStage(),
      airiClient,
      dispatcher,
    )
    agentLoop.start()
    logger.info('AgentLoop started')
  }

  let pruneTimer: ReturnType<typeof setInterval> | undefined
  if (dbConfig.pruneIntervalMs > 0) {
    pruneTimer = setInterval(() => {
      runner.pruneHistory(dbConfig.maxHistoryRows)
        .then((changes) => {
          if (changes > 0)
            logger.info(`Pruned ${changes} message_history rows`)
        })
        .catch((error) => {
          logger.error('Failed to prune message_history rows', error as Error)
        })
    }, dbConfig.pruneIntervalMs)
  }

  let botQQ = config.botQQ ?? ''
  if (botQQ)
    runner.setBotQQ(botQQ)

  // 获取 bot 自身 QQ 号，注入给 WakeStage（用于 @bot 检测）
  client.once('ready', async () => {
    try {
      const loginInfo = await client.getLoginInfo()
      botQQ = String(loginInfo.user_id)
      runner.setBotQQ(botQQ)
      logger.info(`Bot QQ: ${botQQ}`)
    }
    catch (err) {
      logger.warn('getLoginInfo() failed, using config.botQQ fallback', err as Error)
    }
  })

  // 注册消息事件 → 流水线
  client.on('message.group', (data: GroupMessageEvent) => {
    runner.run(normalizeGroupMessage(data, botQQ)).catch(
      err => logger.error('Pipeline error (group)', err as Error),
    )
  })

  client.on('message.private', (data: PrivateMessageEvent) => {
    runner.run(normalizePrivateMessage(data, botQQ)).catch(
      err => logger.error('Pipeline error (private)', err as Error),
    )
  })

  client.on('notice.notify.poke', (data: PokeNotice) => {
    const event = normalizePokeEvent(data, botQQ)

    if (!event)
      return

    runner.run(event).catch(
      err => logger.error('Pipeline error (poke)', err as Error),
    )
  })

  // ─── 启动 NapLink 连接 ─────────────────────────────────────
  await client.connect()
  logger.info('NapLink connected, bot is running')

  // ─── 优雅退出 ──────────────────────────────────────────────
  async function shutdown(signal: string) {
    logger.info(`Received ${signal}, shutting down...`)
    if (pruneTimer)
      clearInterval(pruneTimer)
    agentLoop?.stop()

    airiClient.close()
    await client.disconnect()
    db.close()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[main] Fatal error:', err)
  process.exit(1)
})
