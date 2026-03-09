import type {
  PlannerCheckpoint,
  WorkspaceListTurnsInput,
  WorkspaceMemorySource,
  WorkspaceTurn,
} from '@proj-airi/memory-alaya'

import type { ChatHistoryItem } from '../../../types/chat'
import type { ChatSessionRecord } from '../../../types/chat-session'

import { chatSessionsRepo } from '../../../database/repos/chat-sessions.repo'

// NOTE: Planner MVP only uses user/assistant dialog turns for batching.
// This keeps "N rounds" intuitive for users (N rounds ~= 2N turns).
const plannerSupportedRoles = new Set<WorkspaceTurn['role']>([
  'user',
  'assistant',
])

function isPlannerSupportedRole(role: ChatHistoryItem['role']): role is WorkspaceTurn['role'] {
  return plannerSupportedRoles.has(role as WorkspaceTurn['role'])
}

function normalizeTimestamp(input: unknown, fallback: number) {
  return typeof input === 'number' && Number.isFinite(input) && input >= 0
    ? input
    : fallback
}

function extractMessageContent(message: ChatHistoryItem) {
  if (typeof message.content === 'string')
    return message.content.trim()

  if (!Array.isArray(message.content))
    return ''

  return message.content
    .map((part) => {
      if (typeof part === 'string')
        return part
      if (part && typeof part === 'object' && 'text' in part)
        return String(part.text ?? '')
      return ''
    })
    .join(' ')
    .trim()
}

function resolveSessionIds(scope: WorkspaceListTurnsInput['scope']) {
  if (scope.sessionId)
    return [scope.sessionId]
  if (scope.conversationIds?.length)
    return scope.conversationIds
  return [scope.workspaceId]
}

function applyCheckpoint(
  turns: WorkspaceTurn[],
  checkpoint: PlannerCheckpoint | undefined,
) {
  if (!checkpoint)
    return turns

  if (checkpoint.cursorType === 'timestamp') {
    const cursorTs = Number(checkpoint.cursor)
    if (!Number.isFinite(cursorTs))
      return turns
    return turns.filter(turn => turn.createdAt > cursorTs)
  }

  const checkpointIndex = turns.findIndex(turn => turn.turnId === checkpoint.cursor)
  if (checkpointIndex >= 0)
    return turns.slice(checkpointIndex + 1)

  return turns.filter(turn => turn.createdAt > checkpoint.updatedAt)
}

function applyWindow(
  turns: WorkspaceTurn[],
  window: WorkspaceListTurnsInput['window'] | undefined,
) {
  if (!window)
    return turns

  const fromTs = window.fromTs
  const toTs = window.toTs
  return turns.filter((turn) => {
    if (typeof fromTs === 'number' && turn.createdAt < fromTs)
      return false
    if (typeof toTs === 'number' && turn.createdAt > toTs)
      return false
    return true
  })
}

function mapSessionRecordToWorkspaceTurns(
  workspaceId: string,
  sessionId: string,
  record: ChatSessionRecord,
) {
  const fallbackBaseTs = normalizeTimestamp(record.meta.createdAt, Date.now())
  const turns: WorkspaceTurn[] = []

  record.messages.forEach((message, index) => {
    if (!isPlannerSupportedRole(message.role))
      return

    const content = extractMessageContent(message)
    if (!content)
      return

    const createdAt = normalizeTimestamp(message.createdAt, fallbackBaseTs + index)
    const turnId = message.id || `${sessionId}-turn-${index}-${createdAt}`

    turns.push({
      workspaceId,
      sessionId,
      conversationId: sessionId,
      turnId,
      role: message.role,
      content,
      createdAt,
      tokenCount: Math.max(1, Math.ceil(content.length / 4)),
      source: {
        channel: 'stage-ui-chat-session',
        messageId: message.id,
        userId: record.meta.userId,
      },
      metadata: {
        messageIndex: index,
        characterId: record.meta.characterId,
      },
    })
  })

  return turns
}

export interface CreateChatSessionWorkspaceMemorySourceDeps {
  loadSession?: (sessionId: string) => Promise<ChatSessionRecord | undefined>
}

export function createChatSessionWorkspaceMemorySource(
  deps: CreateChatSessionWorkspaceMemorySourceDeps = {},
): WorkspaceMemorySource {
  const loadSession = deps.loadSession ?? (sessionId => chatSessionsRepo.getSession(sessionId))

  return {
    async listTurns(input) {
      const candidateSessionIds = resolveSessionIds(input.scope).slice(0, input.maxConversations)
      const allTurns: WorkspaceTurn[] = []

      for (const sessionId of candidateSessionIds) {
        const record = await loadSession(sessionId)
        if (!record)
          continue
        allTurns.push(...mapSessionRecordToWorkspaceTurns(input.scope.workspaceId, sessionId, record))
      }

      allTurns.sort((left, right) => {
        if (left.createdAt === right.createdAt)
          return left.turnId.localeCompare(right.turnId)
        return left.createdAt - right.createdAt
      })

      const windowedTurns = applyWindow(allTurns, input.window)
      const checkpointedTurns = applyCheckpoint(windowedTurns, input.checkpoint)
      const limitedTurns = checkpointedTurns.slice(0, input.maxTurns)
      const lastTurn = limitedTurns[limitedTurns.length - 1]

      return {
        turns: limitedTurns,
        nextCursor: lastTurn?.turnId,
        cursorType: 'turn_id' as const,
      }
    },
  }
}
