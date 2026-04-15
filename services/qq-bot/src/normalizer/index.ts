// src/normalizer/index.ts
// ─────────────────────────────────────────────────────────────
// NapLink 事件标准化：OneBot 事件 -> QQMessageEvent
// ─────────────────────────────────────────────────────────────

import type {
  GroupMessageEvent,
  OneBotMessageSegment,
  PokeNotice,
  PrivateMessageEvent,
} from '@naplink/naplink'

import type { QQMessageEvent } from '../types/event'
import type { InputMessageSegment } from '../types/message'

import { createDefaultContext } from '../types/context'
import { buildSessionId } from '../types/event'
import { createLogger } from '../utils/logger'

const logger = createLogger('normalizer')

function normalizeChain(segments: OneBotMessageSegment[]): InputMessageSegment[] {
  const result: InputMessageSegment[] = []

  for (const seg of segments) {
    switch (seg.type) {
      case 'text':
        result.push({ type: 'text', data: { text: seg.data.text } })
        break
      case 'image':
        result.push({ type: 'image', data: { file: seg.data.file, url: seg.data.url } })
        break
      case 'at':
        result.push({ type: 'at', data: { qq: String(seg.data.qq) } })
        break
      case 'reply':
        result.push({ type: 'reply', data: { id: String(seg.data.id) } })
        break
      case 'face':
        result.push({ type: 'face', data: { id: String(seg.data.id) } })
        break
      case 'file':
        result.push({ type: 'file', data: { file: seg.data.file, name: seg.data.name } })
        break
      case 'record':
      case 'audio':
        result.push({ type: 'voice', data: { file: seg.data.file } })
        break
      default:
        logger.debug(`Unknown segment type skipped: ${seg.type}`)
        break
    }
  }

  return result
}

export function normalizeGroupMessage(data: GroupMessageEvent, _botQQ: string): QQMessageEvent {
  const userId = String(data.sender.user_id ?? data.user_id)
  const groupId = String(data.group_id)
  const userName = data.sender.card || data.sender.nickname || userId

  return {
    id: String(data.message_id),
    timestamp: Date.now(),
    source: {
      platform: 'qq',
      type: 'group',
      userId,
      userName,
      groupId,
      groupName: undefined,
      sessionId: buildSessionId('group', groupId, userId),
    },
    raw: data,
    chain: normalizeChain(data.message),
    text: data.raw_message ?? '',
    context: createDefaultContext(),
    stopped: false,
  }
}

export function normalizePrivateMessage(data: PrivateMessageEvent, _botQQ: string): QQMessageEvent {
  const userId = String(data.sender.user_id ?? data.user_id)
  const userName = data.sender.nickname || userId

  return {
    id: String(data.message_id),
    timestamp: Date.now(),
    source: {
      platform: 'qq',
      type: 'private',
      userId,
      userName,
      sessionId: buildSessionId('private', undefined, userId),
    },
    raw: data,
    chain: normalizeChain(data.message),
    text: data.raw_message ?? '',
    context: createDefaultContext(),
    stopped: false,
  }
}

export function normalizePokeEvent(data: PokeNotice, botQQ: string): QQMessageEvent | null {
  if (String(data.target_id) !== botQQ)
    return null

  const userId = String(data.user_id)
  const groupId = data.group_id != null ? String(data.group_id) : undefined
  const type = groupId ? 'group' as const : 'private' as const

  return {
    id: `poke-${Date.now()}-${userId}`,
    timestamp: Date.now(),
    source: {
      platform: 'qq',
      type,
      userId,
      userName: userId,
      groupId,
      sessionId: buildSessionId(type, groupId, userId),
    },
    raw: data,
    chain: [{
      type: 'poke',
      data: { type: data.sub_type, id: String(data.target_id) },
    }],
    text: '',
    context: createDefaultContext(),
    stopped: false,
  }
}
