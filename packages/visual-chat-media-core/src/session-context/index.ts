import type { SessionContext } from '@proj-airi/visual-chat-protocol'

import { generateSessionId } from '@proj-airi/visual-chat-shared'

export function createSessionContext(
  roomName: string,
  sessionId?: string,
): SessionContext {
  const now = Date.now()
  return {
    sessionId: sessionId ?? generateSessionId(),
    roomName,
    mode: 'vision-text-realtime',
    state: 'idle',
    activeVideoSource: null,
    activeAudioSource: null,
    standbyVideoSources: [],
    standbyAudioSources: [],
    inferenceState: {
      isRunning: false,
      currentCnt: 0,
      errorCount: 0,
    },
    createdAt: now,
    lastActivityAt: now,
  }
}

export function updateSessionActivity(ctx: SessionContext): SessionContext {
  return { ...ctx, lastActivityAt: Date.now() }
}

export function updateSessionState(
  ctx: SessionContext,
  state: SessionContext['state'],
): SessionContext {
  return { ...ctx, state, lastActivityAt: Date.now() }
}
