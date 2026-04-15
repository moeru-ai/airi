import type { AiriClient } from '../airi-client'
import type { MessageHistoryRow } from '../db/message-history-repo'
import type { ResponseDispatcher } from '../dispatcher'
import type { PassiveRecordStage } from '../pipeline/passive-record'
import type { QQMessageEvent } from '../types/event'

import { ContextUpdateStrategy } from '../airi-client'
import { createDefaultContext } from '../types/context'
import { createTextResponse } from '../types/response'
import { createLogger } from '../utils/logger'

export interface AgentLoopConfig {
  enabled: boolean
  intervalMs: number
  minUnreadToCheck: number
  maxProactivePerHour: number
}

type ProactiveAction = 'respond' | 'ignore' | 'wait'

interface ProactiveDecision {
  action: ProactiveAction
  message?: string
}

const DEFAULT_REPLY_TIMEOUT_MS = 60_000
const DEFAULT_SEND_MAX_RETRIES = 3
const AGENT_SESSION_SUFFIX = ':agent-loop'
const UNREAD_FETCH_LIMIT = 50
const FENCE_PREFIX_RE = /^```[a-zA-Z]*\s*/u
const FENCE_SUFFIX_RE = /```$/u
const SESSION_ID_RE = /^qq:(private|group|guild):(.+)$/u

export class AgentLoop {
  private timer?: ReturnType<typeof setTimeout>
  private running = false

  private readonly logger = createLogger('agent-loop')
  private readonly sessionCheckpoints = new Map<string, number>()
  private readonly proactiveCounters = new Map<string, number[]>()
  private readonly pendingReplies = new Map<string, (text: string) => void>()

  constructor(
    private readonly config: AgentLoopConfig,
    private readonly passiveRecord: PassiveRecordStage,
    private readonly airiClient: AiriClient,
    private readonly dispatcher: ResponseDispatcher,
  ) {
    this.registerOutputListener()
  }

  start(): void {
    if (this.running)
      return

    this.running = true
    void this.tick()
  }

  stop(): void {
    this.running = false
    if (this.timer)
      clearTimeout(this.timer)
  }

  private registerOutputListener(): void {
    this.airiClient.onEvent('output:gen-ai:chat:message', (event: any) => {
      const sessionId = event.data?.['gen-ai:chat']?.input?.data?.overrides?.sessionId
      const content: string | undefined = event.data?.message?.content

      if (!sessionId)
        return

      const resolve = this.pendingReplies.get(sessionId)
      if (!resolve)
        return

      this.pendingReplies.delete(sessionId)
      resolve(content?.trim() ?? '')
    })
  }

  private async tick(): Promise<void> {
    try {
      if (!this.running || !this.config.enabled)
        return

      const sessions = this.passiveRecord.listActiveSessionIds()
      for (const sessionId of sessions)
        await this.checkSession(sessionId)
    }
    catch (error) {
      this.logger.error('AgentLoop tick failed', error as Error)
    }
    finally {
      if (this.running && this.config.enabled)
        this.timer = setTimeout(() => void this.tick(), this.config.intervalMs)
    }
  }

  private async checkSession(sessionId: string): Promise<void> {
    if (!this.isGroupSession(sessionId))
      return

    if (!this.sessionCheckpoints.has(sessionId)) {
      const latestId = await this.passiveRecord.getLatestMessageId(sessionId)
      if (latestId != null)
        this.sessionCheckpoints.set(sessionId, latestId)
      return
    }

    const checkpoint = this.sessionCheckpoints.get(sessionId) ?? 0
    const unread = await this.passiveRecord.getMessagesAfter(sessionId, checkpoint, UNREAD_FETCH_LIMIT)
    if (unread.length === 0)
      return

    const newest = unread.at(-1)
    if (!newest)
      return

    const newestId = newest.id
    if (unread.length < this.config.minUnreadToCheck) {
      this.sessionCheckpoints.set(sessionId, newestId)
      return
    }

    if (!this.withinProactiveQuota(sessionId)) {
      this.sessionCheckpoints.set(sessionId, newestId)
      return
    }

    const decision = await this.requestDecision(sessionId, unread)
    if (decision.action === 'respond' && decision.message?.trim()) {
      const syntheticEvent = this.buildSyntheticEvent(sessionId, newest)
      await this.dispatcher.send(syntheticEvent, createTextResponse(decision.message.trim()))
      this.recordProactive(sessionId)
      this.sessionCheckpoints.set(sessionId, newestId)
      return
    }

    if (decision.action === 'ignore')
      this.sessionCheckpoints.set(sessionId, newestId)
  }

  private withinProactiveQuota(sessionId: string): boolean {
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    const points = (this.proactiveCounters.get(sessionId) ?? []).filter(ts => ts >= oneHourAgo)

    this.proactiveCounters.set(sessionId, points)
    return points.length < this.config.maxProactivePerHour
  }

  private recordProactive(sessionId: string): void {
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    const points = (this.proactiveCounters.get(sessionId) ?? []).filter(ts => ts >= oneHourAgo)

    points.push(now)
    this.proactiveCounters.set(sessionId, points)
  }

  private async requestDecision(sessionId: string, unread: MessageHistoryRow[]): Promise<ProactiveDecision> {
    const decisionSessionId = `${sessionId}${AGENT_SESSION_SUFFIX}`
    const prompt = this.buildDecisionPrompt(unread)

    const payload = {
      type: 'input:text' as const,
      data: {
        text: prompt,
        textRaw: prompt,
        overrides: {
          messagePrefix: '(QQ AgentLoop): ',
          sessionId: decisionSessionId,
        },
        contextUpdates: [
          {
            strategy: ContextUpdateStrategy.AppendSelf,
            text: '你正在为 QQ 群消息做主动发言决策。',
            content: '你正在为 QQ 群消息做主动发言决策。',
          },
        ],
      } as any,
    }

    const sent = await this.sendWithRetry(payload)
    if (!sent)
      return { action: 'wait' }

    const raw = await this.waitForReply(decisionSessionId)
    if (raw === null)
      return { action: 'wait' }

    return this.parseDecision(raw)
  }

  private buildDecisionPrompt(unread: MessageHistoryRow[]): string {
    const summary = unread
      .map((row, index) => {
        const createdAt = new Date(row.createdAt).toLocaleString('zh-CN')
        const sender = row.senderName ?? row.senderId
        const text = (row.rawText ?? '').trim() || '[无可读文本内容]'
        return `${index + 1}. [${createdAt}] ${sender}: ${text}`
      })
      .join('\n')

    return [
      '你是 QQ 群聊中的 AI 助手，请判断是否需要“主动发言”。',
      `当前有 ${unread.length} 条未读消息，摘要如下：`,
      summary,
      '请严格返回 JSON（不要返回 markdown 代码块）：',
      '{"action":"respond|ignore|wait","message":"当 action=respond 时给出要发送的中文内容，其它情况可留空"}',
      '判断标准：',
      '1) 讨论与 AI 助手明显相关，且你能提供有价值的信息时可 respond。',
      '2) 若只是闲聊、与助手无关、或信息不足，优先 ignore。',
      '3) 若还需要等待更多上下文再判断，返回 wait。',
      '4) 若 respond，message 简洁、自然、避免自我重复。',
    ].join('\n')
  }

  private parseDecision(raw: string): ProactiveDecision {
    const cleaned = this.extractJsonPayload(raw)

    try {
      const parsed = JSON.parse(cleaned) as Partial<ProactiveDecision>
      if (parsed.action === 'respond') {
        return {
          action: 'respond',
          message: typeof parsed.message === 'string' ? parsed.message : '',
        }
      }

      if (parsed.action === 'ignore' || parsed.action === 'wait')
        return { action: parsed.action }
    }
    catch {
      this.logger.warn(`AgentLoop decision parse failed, fallback to ignore: ${raw.slice(0, 120)}`)
    }

    const lower = raw.toLowerCase()
    if (lower.includes('"action":"wait"') || lower.includes(' action: wait'))
      return { action: 'wait' }

    return { action: 'ignore' }
  }

  private extractJsonPayload(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed.startsWith('```'))
      return trimmed

    const withoutFence = trimmed
      .replace(FENCE_PREFIX_RE, '')
      .replace(FENCE_SUFFIX_RE, '')
      .trim()

    return withoutFence
  }

  private async sendWithRetry(payload: any): Promise<boolean> {
    for (let attempt = 1; attempt <= DEFAULT_SEND_MAX_RETRIES; attempt++) {
      try {
        await this.airiClient.ensureConnected({ timeout: 10_000 })
      }
      catch {
        if (attempt < DEFAULT_SEND_MAX_RETRIES)
          await this.delay(2_000)
        continue
      }

      const ok = this.airiClient.send(payload)
      if (ok)
        return true

      if (attempt < DEFAULT_SEND_MAX_RETRIES)
        await this.delay(2_000)
    }

    return false
  }

  private waitForReply(sessionId: string): Promise<string | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingReplies.delete(sessionId)
        resolve(null)
      }, DEFAULT_REPLY_TIMEOUT_MS)

      this.pendingReplies.set(sessionId, (text: string) => {
        clearTimeout(timeout)
        resolve(text)
      })
    })
  }

  private buildSyntheticEvent(sessionId: string, latestRow: MessageHistoryRow): QQMessageEvent {
    const parsed = this.parseSessionId(sessionId)
    const sourceType = parsed?.type ?? 'group'

    const source = sourceType === 'private'
      ? {
          platform: 'qq' as const,
          type: 'private' as const,
          userId: parsed?.id ?? latestRow.senderId,
          userName: latestRow.senderName ?? latestRow.senderId,
          sessionId,
        }
      : {
          platform: 'qq' as const,
          type: 'group' as const,
          userId: latestRow.senderId,
          userName: latestRow.senderName ?? latestRow.senderId,
          groupId: parsed?.id,
          groupName: undefined,
          sessionId,
        }

    return {
      id: `agent-loop-${Date.now()}`,
      timestamp: Date.now(),
      source,
      raw: { kind: 'agent-loop' },
      chain: [],
      text: '',
      context: createDefaultContext(),
      stopped: false,
    }
  }

  private parseSessionId(sessionId: string): { type: 'private' | 'group' | 'guild', id: string } | null {
    const matched = SESSION_ID_RE.exec(sessionId)
    if (!matched)
      return null

    const [, type, id] = matched
    return {
      type: type as 'private' | 'group' | 'guild',
      id,
    }
  }

  private isGroupSession(sessionId: string): boolean {
    return sessionId.startsWith('qq:group:')
  }

  private async delay(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms))
  }
}
