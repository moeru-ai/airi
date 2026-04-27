import type { MemoryRepository } from './repository'
import type {
  MemoryRawTurnSyncConfig,
  MemoryRawTurnSyncTrigger,
  MemoryRawTurnUploadClient,
} from './sync-types'
import type { MemoryRawTurnRecord, MemoryRepositoryScope } from './types'

import { errorMessageFrom } from '@moeru/std'

const defaultMemoryRawTurnSyncConfig: MemoryRawTurnSyncConfig = {
  charThreshold: 2_000,
  idleAfterMs: 8_000,
  oldestPendingAgeMs: 90_000,
  pollIntervalMs: 1_000,
  retryDelayMs: 30_000,
  turnCountThreshold: 4,
}

interface CreateMemoryRawTurnSyncAgentOptions {
  repository: MemoryRepository
  uploadClient: MemoryRawTurnUploadClient
  config?: Partial<MemoryRawTurnSyncConfig>
  now?: () => number
}

export interface MemoryRawTurnSyncAgent {
  tick: () => Promise<void>
  start: () => void
  stop: () => void
  isRunning: () => boolean
}

function createScopeKey(scope: MemoryRepositoryScope) {
  return `${scope.userId}::${scope.characterId}::${scope.sessionId ?? ''}`
}

function getPendingCharacterCount(pendingTurns: MemoryRawTurnRecord[]) {
  return pendingTurns.reduce((total, turn) => total + turn.text.length, 0)
}

/**
 * Evaluates whether a pending raw-turn batch should be uploaded.
 *
 * Use when:
 * - The raw-turn sync agent wants a pure local trigger decision
 * - Tests need deterministic threshold coverage without invoking uploads
 *
 * Expects:
 * - `pendingTurns` are ordered by ascending creation time
 * - `now` is a Unix timestamp in milliseconds
 *
 * Returns:
 * - `null` when no upload should run yet
 * - Otherwise a structured trigger reason with local batch metrics
 */
export function evaluateRawTurnSyncTrigger(params: {
  pendingTurns: MemoryRawTurnRecord[]
  now: number
  config: Pick<MemoryRawTurnSyncConfig, 'turnCountThreshold' | 'charThreshold' | 'oldestPendingAgeMs' | 'idleAfterMs'>
}): MemoryRawTurnSyncTrigger | null {
  const oldestPendingTurn = params.pendingTurns[0]
  const newestPendingTurn = params.pendingTurns.at(-1)

  if (!oldestPendingTurn || !newestPendingTurn) {
    return null
  }

  const pendingTurnCount = params.pendingTurns.length
  const pendingCharacterCount = getPendingCharacterCount(params.pendingTurns)
  const oldestPendingTurnAgeMs = params.now - oldestPendingTurn.createdAt
  const idleDurationMs = params.now - newestPendingTurn.createdAt

  if (pendingTurnCount >= params.config.turnCountThreshold) {
    return {
      idleDurationMs,
      oldestPendingTurnAgeMs,
      pendingCharacterCount,
      pendingTurnCount,
      type: 'turn-count-threshold',
    }
  }

  if (pendingCharacterCount >= params.config.charThreshold) {
    return {
      idleDurationMs,
      oldestPendingTurnAgeMs,
      pendingCharacterCount,
      pendingTurnCount,
      type: 'character-threshold',
    }
  }

  if (oldestPendingTurnAgeMs >= params.config.oldestPendingAgeMs) {
    return {
      idleDurationMs,
      oldestPendingTurnAgeMs,
      pendingCharacterCount,
      pendingTurnCount,
      type: 'oldest-turn-age-threshold',
    }
  }

  if (idleDurationMs >= params.config.idleAfterMs) {
    return {
      idleDurationMs,
      oldestPendingTurnAgeMs,
      pendingCharacterCount,
      pendingTurnCount,
      type: 'idle-threshold',
    }
  }

  return null
}

/**
 * Creates the desktop raw-turn background sync agent skeleton.
 *
 * Use when:
 * - Main-process memory should convert pending local turns into upload batches
 * - A later phase will attach a real uploader without changing local trigger logic
 *
 * Expects:
 * - The repository has already been initialized
 * - The upload client performs only the remote side effect and throws on failure
 *
 * Returns:
 * - An agent with `tick`, `start`, and `stop` controls for local background sync
 */
export function createMemoryRawTurnSyncAgent(options: CreateMemoryRawTurnSyncAgentOptions): MemoryRawTurnSyncAgent {
  const config: MemoryRawTurnSyncConfig = {
    ...defaultMemoryRawTurnSyncConfig,
    ...options.config,
  }
  const now = options.now ?? (() => Date.now())
  const inFlightScopeKeys = new Set<string>()

  let intervalHandle: ReturnType<typeof setInterval> | undefined

  async function tickScope(scope: MemoryRepositoryScope) {
    const scopeKey = createScopeKey(scope)
    if (inFlightScopeKeys.has(scopeKey)) {
      return
    }

    const currentTime = now()
    const syncState = options.repository.getSyncState({ scope })
    if (syncState?.nextRetryAt && syncState.nextRetryAt > currentTime) {
      return
    }

    const pendingTurns = options.repository.listPendingRawTurns({ scope })
    const trigger = evaluateRawTurnSyncTrigger({
      config,
      now: currentTime,
      pendingTurns,
    })

    if (!trigger) {
      return
    }

    inFlightScopeKeys.add(scopeKey)

    try {
      await options.uploadClient.uploadRawTurns({
        scope,
        trigger,
        turns: pendingTurns,
      })

      options.repository.markRawTurnsUploaded({
        scope,
        turnIds: pendingTurns.map(turn => turn.turnId),
        uploadedAt: currentTime,
      })
    }
    catch (error) {
      options.repository.recordRawTurnUploadFailure({
        error: errorMessageFrom(error) ?? String(error),
        failedAt: currentTime,
        nextRetryAt: currentTime + config.retryDelayMs,
        scope,
      })
    }
    finally {
      inFlightScopeKeys.delete(scopeKey)
    }
  }

  return {
    isRunning() {
      return !!intervalHandle
    },
    async tick() {
      const scopes = options.repository.listPendingRawTurnScopes()

      for (const scope of scopes) {
        await tickScope(scope)
      }
    },
    start() {
      if (intervalHandle) {
        return
      }

      intervalHandle = setInterval(() => {
        void this.tick()
      }, config.pollIntervalMs)
    },
    stop() {
      if (!intervalHandle) {
        return
      }

      clearInterval(intervalHandle)
      intervalHandle = undefined
    },
  }
}
