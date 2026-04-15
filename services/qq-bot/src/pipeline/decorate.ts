// src/pipeline/decorate.ts
// ─────────────────────────────────────────────────────────────
// ⑥ DecorateStage：内容替换、长文本拆分、自动 replyTo
// ─────────────────────────────────────────────────────────────

import type { DecorateConfig } from '../config'
import type { StageResult } from '../types/context'
import type { QQMessageEvent } from '../types/event'
import type { OutputMessageSegment } from '../types/message'
import type { MessageResponse } from '../types/response'

import { createMessageResponse, mergeAdjacentText } from '../types/response'
import { PipelineStage } from './stage'

export class DecorateStage extends PipelineStage {
  readonly name = 'DecorateStage'

  constructor(private readonly config: DecorateConfig) {
    super()
    this.initLogger()
  }

  async execute(event: QQMessageEvent): Promise<StageResult> {
    const response = event.context.response
    if (!response)
      return { action: 'continue' }

    if (response.kind !== 'message')
      return { action: 'continue' }

    let segments = response.segments
    segments = this.applyContentFilter(segments)
    segments = this.applySplitStrategy(segments)
    segments = mergeAdjacentText(segments)

    const replyTo = this.config.autoReply
      ? (response.replyTo ?? event.id)
      : response.replyTo

    const decorated: MessageResponse = createMessageResponse(segments, replyTo)
    event.context.response = decorated
    return { action: 'continue' }
  }

  private applyContentFilter(segments: OutputMessageSegment[]): OutputMessageSegment[] {
    if (!this.config.contentFilter.enabled)
      return segments
    const replacements = this.config.contentFilter.replacements
    const entries = Object.entries(replacements)
    if (entries.length === 0)
      return segments

    return segments.map((segment) => {
      if (segment.type !== 'text')
        return segment

      let text = segment.data.text
      for (const [from, to] of entries)
        text = text.split(from).join(to)

      return { type: 'text', data: { text } }
    })
  }

  private applySplitStrategy(segments: OutputMessageSegment[]): OutputMessageSegment[] {
    if (segments.length === 0)
      return segments

    const result: OutputMessageSegment[] = []
    for (const segment of segments) {
      if (segment.type !== 'text') {
        result.push(segment)
        continue
      }

      if (segment.data.text.length <= this.config.maxMessageLength) {
        result.push(segment)
        continue
      }

      if (this.config.splitStrategy === 'truncate') {
        result.push({
          type: 'text',
          data: { text: segment.data.text.slice(0, this.config.maxMessageLength) },
        })
        continue
      }

      const chunks = this.splitText(segment.data.text, this.config.maxMessageLength)
      for (const chunk of chunks) {
        result.push({
          type: 'text',
          data: { text: chunk },
        })
      }
    }

    return result
  }

  private splitText(text: string, maxLength: number): string[] {
    const chunks: string[] = []
    let remaining = text

    while (remaining.length > maxLength) {
      let splitAt = remaining.lastIndexOf('\n', maxLength)
      if (splitAt <= 0)
        splitAt = remaining.lastIndexOf(' ', maxLength)
      if (splitAt <= 0)
        splitAt = maxLength

      chunks.push(remaining.slice(0, splitAt))
      remaining = remaining.slice(splitAt).trimStart()
    }

    if (remaining)
      chunks.push(remaining)

    return chunks
  }
}
