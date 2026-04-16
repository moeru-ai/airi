// src/pipeline/process.ts
// ─────────────────────────────────────────────────────────────
// ⑤ ProcessStage — 核心处理
//
// 功能：将消息转发给 AIRI server，等待 LLM 响应后写入 context.response。
// 设计依据：
//   - LLM 调用完全委托 AIRI server，本阶段只做协议转换：
//     QQMessageEvent → AIRI input:text 事件 → 等待 output:gen-ai:chat:message
//   - 用 sessionId 过滤响应，避免并发会话串话。
//   - 持久监听 + pending Map：onEvent 只注册一次，每次 waitForReply
//     仅向 Map 注册 resolve，无竞态、无内存泄漏风险。
//   - sendWithRetry：检查 send() 返回值，连接断开时自动等待重连后重试。
//   - 内置命令（/help /status /clear）在 LLM 调用前前置处理，
//     命中则直接 respond 不消耗 AIRI 资源。
// ─────────────────────────────────────────────────────────────

import type { AiriClient } from '../airi-client'
import type { ProcessConfig } from '../config'
import type { ConversationRepo } from '../db/conversation-repo'
import type { StageResult } from '../types/context'
import type { QQMessageEvent } from '../types/event'

import { randomUUID } from 'node:crypto'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'

import { createSilentResponse, createTextResponse } from '../types/response'
import { serializeChain } from '../utils/chain-serializer'
import { normalizeContent } from '../utils/normalize-content'
import { PipelineStage } from './stage'

const COMMAND_SPLIT_RE = /\s+/u

export class ProcessStage extends PipelineStage {
  readonly name = 'ProcessStage'

  /** 等待 AIRI 响应的超时时间 (ms) */
  private readonly replyTimeoutMs: number
  /** 发送重试次数 */
  private readonly sendMaxRetries: number

  /** correlationId → resolve 函数，持久监听用于分发响应 */
  private readonly pendingReplies = new Map<string, (text: string) => void>()

  constructor(
    private readonly config: ProcessConfig,
    private readonly airiClient: AiriClient,
    private readonly conversationRepo: ConversationRepo,
  ) {
    super()
    this.initLogger()
    this.replyTimeoutMs = config.replyTimeoutMs ?? 60_000
    this.sendMaxRetries = config.sendMaxRetries ?? 3
    this.registerOutputListener()
  }

  // ─── 持久输出监听（构造时注册一次）────────────────────────────

  /**
   * 注册持久的 output:gen-ai:chat:message 监听器。
   * 收到响应后按 correlationId 分发给对应的 waitForReply Promise。
   */
  private registerOutputListener(): void {
    this.airiClient.onEvent('output:gen-ai:chat:message', (event: any) => {
      this.logger.debug('[AIRI raw output]', JSON.stringify(event))

      const correlationId
        = event.data?.['gen-ai:chat']?.input?.data?.overrides?.correlationId
          ?? event.data?.['gen-ai:chat']?.input?.data?.overrides?.sessionId
      const normalizedContent = normalizeContent(event.data?.message?.content)

      if (!correlationId) {
        this.logger.warn('output:gen-ai:chat:message missing correlationId/sessionId, dropping')
        return
      }

      const resolve = this.pendingReplies.get(correlationId)
      if (resolve) {
        this.pendingReplies.delete(correlationId)
        resolve(normalizedContent.trim())
      }
      else {
        this.logger.warn(`No pending reply for correlationId=${correlationId}, dropping`)
      }
    })
  }

  // ─── 流水线主逻辑 ─────────────────────────────────────────────

  async execute(event: QQMessageEvent): Promise<StageResult> {
    // ─── 内置命令前置处理 ─────────────────────────────────────
    const cmdResult = await this.handleCommand(event)
    if (cmdResult)
      return cmdResult

    // 未唤醒的消息不走 LLM
    if (!event.context.isWakeUp)
      return { action: 'continue' }

    // ─── 发送给 AIRI server（带重试）──────────────────────────
    const { source, text } = event
    const qqContext = source.type === 'group'
      ? `消息来自QQ群 ${source.groupId}（${source.groupName ?? ''}）`
      : `消息来自QQ私聊`

    // 将结构化会话历史压平为人类可读的对话行，注入给 AIRI 作为额外上下文。
    // 这里不修改 event.text，仅通过 contextUpdates 追加，保证主输入与历史上下文解耦。
    const history = event.context.sessionHistory ?? []
    const historyLines = history
      .map(record => serializeChain(record.chain, record.senderName))
      .filter(Boolean)

    const historyContext = historyLines.length > 0
      ? `以下是该群最近的聊天记录（供理解上下文用）:\n${historyLines.join('\n')}`
      : undefined

    const conversationHistory = event.context.conversationHistory ?? []
    const conversationLines = conversationHistory
      .map(message => `${message.role}: ${message.content}`)
      .filter(Boolean)

    const conversationContext = conversationLines.length > 0
      ? `以下是当前会话的历史对话（供理解上下文用）:\n${conversationLines.join('\n')}`
      : undefined

    const semanticHistory = event.context.semanticHistory ?? []
    const semanticLines = semanticHistory
      .map(record => `[${new Date(record.createdAt).toLocaleString()}] ${record.senderName ?? 'Unknown'}: ${record.rawText ?? ''}`)
      .filter(Boolean)

    const semanticContext = semanticLines.length > 0
      ? `以下是语义相关的历史消息（可能来自更早的对话）:\n${semanticLines.join('\n')}`
      : undefined

    const contextUpdates = [
      ...(qqContext
        ? [{
            strategy: ContextUpdateStrategy.AppendSelf,
            text: qqContext,
            content: qqContext,
            metadata: { qq: source },
          }]
        : []),
      ...(historyContext
        ? [{
            strategy: ContextUpdateStrategy.AppendSelf,
            text: historyContext,
            content: historyContext,
          }]
        : []),
      ...(conversationContext
        ? [{
            strategy: ContextUpdateStrategy.AppendSelf,
            text: conversationContext,
            content: conversationContext,
          }]
        : []),
      ...(semanticContext
        ? [{
            strategy: ContextUpdateStrategy.AppendSelf,
            text: semanticContext,
            content: semanticLines.join('\n'),
          }]
        : []),
    ]

    const correlationId = randomUUID()

    const payload = {
      type: 'input:text' as const,
      data: {
        text,
        textRaw: text,
        overrides: {
          messagePrefix: `(来自QQ用户 ${source.userName}): `,
          sessionId: source.sessionId,
          correlationId,
        },
        contextUpdates: contextUpdates.length > 0 ? contextUpdates : undefined,
        qq: source,
      } as any,
    }

    const sent = await this.sendWithRetry(payload)
    if (!sent) {
      this.logger.warn(`Failed to send to AIRI after ${this.sendMaxRetries} retries, sessionId=${source.sessionId}`)
      event.context.response = createSilentResponse()
      return { action: 'continue' }
    }

    this.logger.debug(`Sent to AIRI: sessionId=${source.sessionId}, text="${text.slice(0, 50)}"`)

    // ─── 等待 AIRI 响应 ───────────────────────────────────────
    const reply = await this.waitForReply(correlationId)

    if (reply === null) {
      this.logger.warn(`AIRI reply timeout (${this.replyTimeoutMs}ms): sessionId=${source.sessionId}`)
      event.context.response = createSilentResponse()
      return { action: 'continue' }
    }

    this.logger.debug(`Got AIRI reply: "${reply.slice(0, 50)}"`)
    event.context.response = createTextResponse(reply, event.id)
    return { action: 'continue' }
  }

  // ─── 内置命令 ────────────────────────────────────────────────

  /**
   * 处理内置命令。
   * @returns StageResult（命中时）或 null（未命中时）
   */
  private async handleCommand(event: QQMessageEvent): Promise<StageResult | null> {
    const commandConfig = this.config.commands
    if (!commandConfig)
      return null

    const { prefix, enabled } = commandConfig
    const text = event.text.trim()

    if (!text.startsWith(prefix))
      return null

    const [cmd, ...args] = text.slice(prefix.length).split(COMMAND_SPLIT_RE)
    const command = cmd?.toLowerCase() ?? ''

    if (!enabled.includes(command))
      return null

    switch (command) {
      case 'help':
        return {
          action: 'respond',
          payload: createTextResponse(
            `可用命令：${enabled.map(c => prefix + c).join(' · ')}`,
            event.id,
          ),
        }
      case 'status':
        return {
          action: 'respond',
          payload: createTextResponse(
            `QQ OneBot 适配器运行中 ✓\nAIRI server 已连接`,
            event.id,
          ),
        }
      case 'new': {
        const conversation = await this.conversationRepo.create(event.source.sessionId)
        event.context.conversationId = conversation.conversationId
        event.context.conversationHistory = []
        return {
          action: 'respond',
          payload: createTextResponse(`已创建新对话：${conversation.conversationId}`, event.id),
        }
      }
      case 'switch': {
        const targetConversationId = args[0]
        if (!targetConversationId) {
          return {
            action: 'respond',
            payload: createTextResponse('用法：/switch {conversationId}', event.id),
          }
        }

        const target = await this.conversationRepo.getById(targetConversationId)
        if (!target || target.sessionId !== event.source.sessionId) {
          return {
            action: 'respond',
            payload: createTextResponse('未找到该会话 ID，或该会话不属于当前 session。', event.id),
          }
        }

        await this.conversationRepo.switchTo(event.source.sessionId, targetConversationId)
        event.context.conversationId = targetConversationId
        try {
          event.context.conversationHistory = target.content ? JSON.parse(target.content) : []
        }
        catch {
          event.context.conversationHistory = []
        }

        return {
          action: 'respond',
          payload: createTextResponse(`已切换到对话：${targetConversationId}`, event.id),
        }
      }
      case 'history': {
        const conversations = await this.conversationRepo.list(event.source.sessionId)
        if (conversations.length === 0) {
          return {
            action: 'respond',
            payload: createTextResponse('当前没有历史对话。', event.id),
          }
        }

        const currentConversationId = event.context.conversationId
        const listText = conversations
          .map((conversation, index) => {
            const marker = conversation.conversationId === currentConversationId ? '*' : ' '
            const title = conversation.title ?? '(untitled)'
            return `${index + 1}. [${marker}] ${conversation.conversationId} ${title}`
          })
          .join('\n')

        return {
          action: 'respond',
          payload: createTextResponse(`会话列表（* 表示当前会话）:\n${listText}`, event.id),
        }
      }
      case 'clear':
        if (event.context.conversationId)
          await this.conversationRepo.delete(event.context.conversationId)

        {
          const conversation = await this.conversationRepo.create(event.source.sessionId)
          event.context.conversationId = conversation.conversationId
          event.context.conversationHistory = []
        }

        event.context.extensions.proc_clearSession = true
        return {
          action: 'respond',
          payload: createTextResponse('已清空当前会话并创建新对话 ✓', event.id),
        }
      default:
        return null
    }
  }

  // ─── 带重试的发送 ──────────────────────────────────────────

  /**
   * 等待 AIRI 连接就绪后发送，失败则重试。
   *
   * 设计依据：
   *   - SDK 的 send() 在连接断开时静默返回 false（不报错），
   *     必须检查返回值。
   *   - 发送前调用 ensureConnected() 等待重连完成。
   *   - 重试间隔 2 秒，给 SDK 足够的重连时间。
   */
  private async sendWithRetry(payload: any): Promise<boolean> {
    for (let attempt = 1; attempt <= this.sendMaxRetries; attempt++) {
      try {
        await this.airiClient.ensureConnected({ timeout: 10_000 })
      }
      catch {
        this.logger.warn(`AIRI not connected, attempt ${attempt}/${this.sendMaxRetries}`)
        if (attempt < this.sendMaxRetries)
          await new Promise(r => setTimeout(r, 2000))
        continue
      }

      const ok = this.airiClient.send(payload)
      if (ok) {
        if (attempt > 1)
          this.logger.info(`Send succeeded on attempt ${attempt}`)
        return true
      }

      this.logger.warn(`send() returned false, attempt ${attempt}/${this.sendMaxRetries}`)
      if (attempt < this.sendMaxRetries)
        await new Promise(r => setTimeout(r, 2000))
    }

    return false
  }

  // ─── 等待 AIRI 响应 ──────────────────────────────────────────

  /**
   * 向 pendingReplies Map 注册一个 resolve，等待持久监听器分发结果。
   *
   * 设计依据：
   *   - 不自己 add/remove onEvent，避免竞态。
   *   - timeout 后从 Map 删除自身，避免内存泄漏。
   *
   * @param sessionId - 当前会话 ID
   * @returns 响应文本（有内容时）或 null（超时时）
   */
  private waitForReply(correlationId: string): Promise<string | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingReplies.delete(correlationId)
        resolve(null)
      }, this.replyTimeoutMs)

      this.pendingReplies.set(correlationId, (text: string) => {
        clearTimeout(timer)
        resolve(text.length > 0 ? text : null)
      })
    })
  }
}
