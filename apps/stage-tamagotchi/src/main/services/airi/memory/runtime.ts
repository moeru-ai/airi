import type { MemoryRepository } from './repository'
import type { MemoryRawTurnSyncAgent } from './sync-agent'
import type {
  MemoryPatchPullStatus,
  MemoryRawTurnSyncRuntimeConfig,
  MemoryRawTurnUploaderStatus,
} from './sync-types'

import process from 'node:process'

import { onAppBeforeQuit, onAppReady } from '../../../libs/bootkit/lifecycle'
import { createMemoryPatchPullRuntime } from './patch-client'
import { createMemoryRawTurnSyncAgent } from './sync-agent'
import { createMemoryRawTurnUploadRuntime } from './uploader'

const defaultMemoryRawTurnSyncRuntimeConfig: MemoryRawTurnSyncRuntimeConfig = {
  charThreshold: 2_000,
  idleAfterMs: 8_000,
  oldestPendingAgeMs: 90_000,
  pollIntervalMs: 1_000,
  rawTurnRetentionWindowMs: Number(
    import.meta.env.VITE_MEMORY_RAW_TURN_RETENTION_WINDOW_MS
      || process.env.AIRI_MEMORY_RAW_TURN_RETENTION_WINDOW_MS
      || 30 * 24 * 60 * 60 * 1000,
  ),
  retryDelayMs: 30_000,
  turnCountThreshold: 4,
  patch: {
    authToken: import.meta.env.VITE_MEMORY_PATCH_AUTH_TOKEN || process.env.AIRI_MEMORY_PATCH_AUTH_TOKEN || null,
    enabled: (import.meta.env.VITE_MEMORY_PATCH_ENABLED || process.env.AIRI_MEMORY_PATCH_ENABLED || '') === '1',
    endpointUrl: import.meta.env.VITE_MEMORY_PATCH_ENDPOINT_URL || process.env.AIRI_MEMORY_PATCH_ENDPOINT_URL || null,
    pullIntervalMs: Number(import.meta.env.VITE_MEMORY_PATCH_PULL_INTERVAL_MS || process.env.AIRI_MEMORY_PATCH_PULL_INTERVAL_MS || 15_000),
    requestTimeoutMs: Number(import.meta.env.VITE_MEMORY_PATCH_REQUEST_TIMEOUT_MS || process.env.AIRI_MEMORY_PATCH_REQUEST_TIMEOUT_MS || 10_000),
    retryDelayMs: Number(import.meta.env.VITE_MEMORY_PATCH_RETRY_DELAY_MS || process.env.AIRI_MEMORY_PATCH_RETRY_DELAY_MS || 30_000),
  },
  uploader: {
    authToken: import.meta.env.VITE_MEMORY_SYNC_AUTH_TOKEN || process.env.AIRI_MEMORY_SYNC_AUTH_TOKEN || null,
    enabled: (import.meta.env.VITE_MEMORY_SYNC_ENABLED || process.env.AIRI_MEMORY_SYNC_ENABLED || '') === '1',
    endpointUrl: import.meta.env.VITE_MEMORY_SYNC_ENDPOINT_URL || process.env.AIRI_MEMORY_SYNC_ENDPOINT_URL || null,
    requestTimeoutMs: Number(import.meta.env.VITE_MEMORY_SYNC_REQUEST_TIMEOUT_MS || process.env.AIRI_MEMORY_SYNC_REQUEST_TIMEOUT_MS || 10_000),
  },
}

export interface MemorySyncRuntimeStatus {
  patch: MemoryPatchPullStatus
  uploader: MemoryRawTurnUploaderStatus
  running: boolean
}

export interface MemorySyncRuntime {
  tick: () => Promise<void>
  start: () => void
  stop: () => void
  getStatus: () => MemorySyncRuntimeStatus
  agent: MemoryRawTurnSyncAgent
}

interface SetupMemorySyncRuntimeOptions {
  repository: MemoryRepository
  config?: Partial<MemoryRawTurnSyncRuntimeConfig>
  now?: () => number
  fetchImpl?: typeof fetch
}

function mergeMemorySyncRuntimeConfig(config?: Partial<MemoryRawTurnSyncRuntimeConfig>): MemoryRawTurnSyncRuntimeConfig {
  return {
    ...defaultMemoryRawTurnSyncRuntimeConfig,
    ...config,
    patch: {
      ...defaultMemoryRawTurnSyncRuntimeConfig.patch,
      ...config?.patch,
    },
    uploader: {
      ...defaultMemoryRawTurnSyncRuntimeConfig.uploader,
      ...config?.uploader,
    },
  }
}

/**
 * Sets up the live desktop raw-turn sync runtime and hooks it into app lifecycle.
 *
 * Use when:
 * - The main process should automatically scan and upload pending raw turns
 * - Startup and shutdown must control the sync agent without blocking the app
 *
 * Expects:
 * - Repository is already initialized
 * - Config is resolved from one centralized runtime config source
 *
 * Returns:
 * - A runtime wrapper exposing current uploader status plus start/stop/tick controls
 */
export function setupMemorySyncRuntime(options: SetupMemorySyncRuntimeOptions): MemorySyncRuntime {
  const config = mergeMemorySyncRuntimeConfig(options.config)
  const uploadRuntime = createMemoryRawTurnUploadRuntime({
    config: config.uploader,
    fetchImpl: options.fetchImpl,
  })
  const patchRuntime = createMemoryPatchPullRuntime({
    config: config.patch,
    fetchImpl: options.fetchImpl,
  })
  const uploadedScopeKeys = new Set<string>()
  const agent = createMemoryRawTurnSyncAgent({
    config,
    now: options.now,
    repository: options.repository,
    uploadClient: {
      async uploadRawTurns(request) {
        await uploadRuntime.client.uploadRawTurns(request)
        uploadedScopeKeys.add(`${request.scope.userId}::${request.scope.characterId}::${request.scope.sessionId ?? ''}`)
      },
    },
  })

  let isRunning = false
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  function createScopeKey(scope: { userId: string, characterId: string, sessionId?: string | null }) {
    return `${scope.userId}::${scope.characterId}::${scope.sessionId ?? ''}`
  }

  async function pullEligiblePatches(currentTime: number) {
    if (patchRuntime.getStatus().mode === 'disabled') {
      return
    }

    const syncScopes = options.repository.listSyncScopes()
    for (const scope of syncScopes) {
      const scopeKey = createScopeKey(scope)
      const syncState = options.repository.getSyncState({ scope })
      const shouldPull = uploadedScopeKeys.has(scopeKey)
        || ((syncState?.nextPullAt ?? 0) <= currentTime)

      if (!shouldPull) {
        continue
      }

      try {
        const patch = await patchRuntime.client.fetchMemoryPatch(scope, syncState)
        options.repository.applyMemoryPatch({
          nextPullAt: currentTime + config.patch.pullIntervalMs,
          patch: patch ?? { scope },
          pulledAt: currentTime,
        })
      }
      catch (error) {
        options.repository.recordMemoryPatchPullFailure({
          error: error instanceof Error ? error.message : String(error),
          failedAt: currentTime,
          nextPullAt: currentTime + config.patch.retryDelayMs,
          scope,
        })
      }
    }
  }

  function pruneUploadedTurnsBeyondRetention(currentTime: number) {
    const syncScopes = options.repository.listSyncScopes()
    for (const scope of syncScopes) {
      options.repository.pruneUploadedTurns({
        now: currentTime,
        retentionWindowMs: config.rawTurnRetentionWindowMs,
        scope,
      })
    }
  }

  async function tick() {
    const currentTime = options.now ? options.now() : Date.now()
    uploadedScopeKeys.clear()
    await agent.tick()
    await pullEligiblePatches(currentTime)
    pruneUploadedTurnsBeyondRetention(currentTime)
  }

  function scheduleNextTick() {
    if (!isRunning) {
      return
    }

    timeoutHandle = setTimeout(() => {
      timeoutHandle = undefined
      void runScheduledTick()
    }, config.pollIntervalMs)
  }

  async function runScheduledTick() {
    try {
      await tick()
    }
    finally {
      scheduleNextTick()
    }
  }

  function start() {
    if (isRunning) {
      return
    }
    if (uploadRuntime.getStatus().mode === 'disabled' && patchRuntime.getStatus().mode === 'disabled') {
      return
    }

    isRunning = true
    scheduleNextTick()
  }

  function stop() {
    if (!isRunning && !timeoutHandle) {
      return
    }

    isRunning = false
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
      timeoutHandle = undefined
    }
  }

  onAppReady(() => {
    start()
  })

  onAppBeforeQuit(() => {
    stop()
  })

  return {
    agent,
    getStatus() {
      return {
        patch: patchRuntime.getStatus(),
        running: isRunning,
        uploader: uploadRuntime.getStatus(),
      }
    },
    tick,
    start,
    stop,
  }
}
