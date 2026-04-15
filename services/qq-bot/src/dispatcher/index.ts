// src/dispatcher/index.ts
// ─────────────────────────────────────────────────────────────
// ResponsePayload 派发层：把内部响应模型转换为 NapLink API 调用。
// ─────────────────────────────────────────────────────────────

import type { NapLink } from '@naplink/naplink'

import type { RespondConfig } from '../config'
import type { QQMessageEvent } from '../types/event'
import type { OutputMessageSegment } from '../types/message'
import type { ForwardNode, ResponsePayload } from '../types/response'

import { createLogger } from '../utils/logger'

const logger = createLogger('dispatcher')

class NonRetryableSendError extends Error {}

export class ResponseDispatcher {
  constructor(
    private readonly client: NapLink,
    private readonly config: RespondConfig,
  ) {}

  async send(event: QQMessageEvent, payload: ResponsePayload): Promise<void> {
    switch (payload.kind) {
      case 'silent':
        return
      case 'message': {
        const messageBatches = this.splitForDispatch(payload.segments)
        for (let i = 0; i < messageBatches.length; i++) {
          await this.delay(this.randomTypingDelay())
          await this.sendMessage(event, messageBatches[i]!, payload.replyTo)
          if (i < messageBatches.length - 1)
            await this.delay(this.config.multiMessageDelay)
        }
        return
      }
      case 'forward':
        await this.delay(this.randomTypingDelay())
        await this.sendForward(event, payload.forward)
        return
      default: {
        const _exhaustive: never = payload
        return _exhaustive
      }
    }
  }

  private splitForDispatch(segments: OutputMessageSegment[]): OutputMessageSegment[][] {
    if (segments.length <= 1)
      return [segments]

    const allText = segments.every(seg => seg.type === 'text')
    if (!allText)
      return [segments]

    return segments.map(seg => [seg])
  }

  private async sendMessage(
    event: QQMessageEvent,
    segments: OutputMessageSegment[],
    replyTo?: string,
  ): Promise<void> {
    const finalSegments = replyTo
      ? [{ type: 'reply', data: { id: replyTo } } as const, ...segments]
      : segments

    for (let attempt = 0; attempt <= this.config.retryCount; attempt++) {
      try {
        if (event.source.type === 'group' && event.source.groupId) {
          const res = await this.client.sendGroupMessage(event.source.groupId, finalSegments)
          this.assertOneBotSuccess(res)
        }
        else {
          const res = await this.client.sendPrivateMessage(event.source.userId, finalSegments)
          this.assertOneBotSuccess(res)
        }
        return
      }
      catch (err) {
        const isLast = attempt >= this.config.retryCount
        if (err instanceof NonRetryableSendError || !this.isRetryableError(err) || isLast)
          throw err
        logger.warn(`sendMessage failed, retrying (${attempt + 1}/${this.config.retryCount})`, err)
        await this.delay(this.config.retryDelayMs)
      }
    }
  }

  private async sendForward(event: QQMessageEvent, nodes: ForwardNode[]): Promise<void> {
    if (event.source.type === 'group' && event.source.groupId) {
      const naplinkNodes = nodes.map((node) => {
        return {
          type: 'node',
          data: {
            name: node.name,
            uin: node.uin,
            content: node.content,
            ...(node.time != null && { time: node.time }),
          },
        }
      })

      for (let attempt = 0; attempt <= this.config.retryCount; attempt++) {
        try {
          const res = await this.client.sendGroupForwardMessage(event.source.groupId, naplinkNodes)
          this.assertOneBotSuccess(res)
          return
        }
        catch (err) {
          const isLast = attempt >= this.config.retryCount
          if (err instanceof NonRetryableSendError || !this.isRetryableError(err) || isLast)
            throw err
          logger.warn(`sendForward failed, retrying (${attempt + 1}/${this.config.retryCount})`, err)
          await this.delay(this.config.retryDelayMs)
        }
      }
      return
    }

    // NOTICE: OneBot V11 无私聊合并转发标准动作；私聊回退为逐条消息发送。
    for (let i = 0; i < nodes.length; i++) {
      await this.sendMessage(event, nodes[i]!.content)
      if (i < nodes.length - 1)
        await this.delay(this.config.multiMessageDelay)
    }
  }

  private assertOneBotSuccess(response: unknown): void {
    if (!response || typeof response !== 'object')
      return

    const maybeRetcode = (response as { retcode?: unknown }).retcode
    if (typeof maybeRetcode === 'number' && maybeRetcode !== 0) {
      throw new NonRetryableSendError(`OneBot action failed with retcode=${maybeRetcode}`)
    }
  }

  private isRetryableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    return [
      'timeout',
      'timed out',
      'network',
      'socket',
      'econn',
      'enotfound',
      'ehostunreach',
      'connection',
      'reconnect',
    ].some(keyword => message.includes(keyword))
  }

  private randomTypingDelay(): number {
    const min = Math.min(this.config.typingDelay.min, this.config.typingDelay.max)
    const max = Math.max(this.config.typingDelay.min, this.config.typingDelay.max)
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  private async delay(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms))
  }
}

export function createDispatcher(client: NapLink, config?: RespondConfig): ResponseDispatcher {
  const fallback: RespondConfig = config ?? {
    typingDelay: { min: 200, max: 1_000 },
    multiMessageDelay: 500,
    retryCount: 2,
    retryDelayMs: 1_000,
  }
  return new ResponseDispatcher(client, fallback)
}

export type { ForwardNode }
