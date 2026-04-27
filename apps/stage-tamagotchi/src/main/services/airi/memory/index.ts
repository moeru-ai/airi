import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { ElectronMemoryGetSyncStateResponse, ElectronMemoryScope } from '../../../../shared/eventa/memory'
import type { MemoryRepository } from './repository'
import type { MemorySyncRuntime } from './runtime'
import type { MemoryPromptContext, MemoryRecentTurnRecord, MemoryStableFactRecord } from './types'

import { join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { app } from 'electron'

import {
  electronMemoryAppendTurn,
  electronMemoryGetSyncState,
  electronMemoryReadPromptContext,
} from '../../../../shared/eventa/memory'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { createMemoryRepository } from './repository'
import { setupMemorySyncRuntime } from './runtime'
import { MEMORY_SCHEMA_V1_VERSION } from './schema'

let singletonRepository: MemoryRepository | null = null
let repositoryInitialized = false
let repositoryCleanupRegistered = false
let singletonSyncRuntime: MemorySyncRuntime | null = null

function mapStableFact(record: MemoryStableFactRecord) {
  return {
    confidence: record.confidence,
    id: record.id,
    key: record.factKey,
    value: record.factValue,
  }
}

function mapRecentTurn(record: MemoryRecentTurnRecord) {
  return {
    createdAt: record.createdAt,
    role: record.role,
    text: record.text,
    turnId: record.turnId,
  }
}

function mapPromptContext(scope: ElectronMemoryScope, promptContext: MemoryPromptContext) {
  return {
    memoryCards: [],
    profileSummary: promptContext.profileSummary?.summaryMarkdown ?? null,
    recentTurns: promptContext.recentTurns.map(mapRecentTurn),
    schemaVersion: MEMORY_SCHEMA_V1_VERSION,
    scope,
    stableFacts: promptContext.stableFacts.map(mapStableFact),
  }
}

function mapSyncState(scope: ElectronMemoryScope, syncState: ReturnType<MemoryRepository['getSyncState']>, runtime?: MemorySyncRuntime): ElectronMemoryGetSyncStateResponse {
  const runtimeStatus = runtime?.getStatus()
  let syncMode: ElectronMemoryGetSyncStateResponse['syncMode'] = 'enabled'
  let syncModeReason: string | null = null

  if (runtimeStatus?.uploader.mode === 'disabled' && runtimeStatus.patch.mode === 'disabled') {
    syncMode = 'disabled'
    syncModeReason = runtimeStatus.uploader.reason ?? runtimeStatus.patch.reason ?? 'memory background sync disabled'
  }

  return {
    runtimeMode: 'desktop-local-sqlite' as const,
    schemaVersion: MEMORY_SCHEMA_V1_VERSION,
    scope,
    syncMode,
    syncModeReason,
    syncState: syncState
      ? {
          lastAppliedSummaryVersion: syncState.lastAppliedSummaryVersion,
          lastError: syncState.lastError ?? null,
          lastLocalTurnCheckpoint: syncState.lastLocalTurnCheckpoint,
          lastPullAt: syncState.lastPullAt ?? null,
          lastSyncedAt: syncState.lastSyncedAt ?? null,
          lastUploadAt: syncState.lastUploadAt ?? null,
          pendingTurnCount: syncState.pendingTurnCount,
          remoteCheckpoint: syncState.remoteCheckpoint ?? null,
          state: syncState.state as 'idle' | 'syncing' | 'error',
          syncCheckpoint: syncState.syncCheckpoint,
        }
      : null,
  }
}

/**
 * Creates the desktop memory repository singleton and initializes it once.
 *
 * Use when:
 * - Main-process services need one shared local SQLite memory repository
 * - App lifecycle should close the repository through the standard bootkit hook
 *
 * Expects:
 * - Electron `app.getPath('userData')` resolves to a writable directory
 *
 * Returns:
 * - The shared memory repository instance
 */
export function setupMemoryRepository(): MemoryRepository {
  if (!singletonRepository) {
    singletonRepository = createMemoryRepository({
      databasePath: join(app.getPath('userData'), 'memory.sqlite'),
    })
  }

  if (!repositoryInitialized) {
    singletonRepository.initialize()
    repositoryInitialized = true
  }

  if (!repositoryCleanupRegistered) {
    onAppBeforeQuit(() => {
      singletonRepository?.close()
    })
    repositoryCleanupRegistered = true
  }

  return singletonRepository
}

/**
 * Creates the desktop memory sync runtime singleton and wires it into app lifecycle once.
 *
 * Use when:
 * - The main process should automatically scan and upload pending raw turns
 * - Sync runtime status should stay centralized inside the memory service boundary
 *
 * Expects:
 * - The memory repository singleton is already available or can be created on demand
 *
 * Returns:
 * - The shared memory sync runtime instance
 */
export function setupMemorySync(): MemorySyncRuntime {
  if (!singletonSyncRuntime) {
    singletonSyncRuntime = setupMemorySyncRuntime({
      repository: setupMemoryRepository(),
    })
  }

  return singletonSyncRuntime
}

/**
 * Registers desktop local-memory Eventa invoke handlers on a main-process context.
 *
 * Use when:
 * - A shared main-process Eventa context should expose local-memory capabilities
 * - Phase 3 needs handler wiring without renderer/store integration
 *
 * Expects:
 * - `repository` is the singleton repository created by {@link setupMemoryRepository}
 * - `context` is a main-process Eventa context ready for invoke registration
 *
 * Returns:
 * - Registers handlers on the provided context and does not return a value
 */
export function createMemoryService(params: {
  context: ReturnType<typeof createContext>['context']
  repository: MemoryRepository
  runtime?: MemorySyncRuntime
}) {
  defineInvokeHandler(params.context, electronMemoryReadPromptContext, async (payload) => {
    const promptContext = params.repository.readPromptContext(payload)

    return mapPromptContext(payload.scope, promptContext)
  })

  defineInvokeHandler(params.context, electronMemoryAppendTurn, async (payload) => {
    const record = params.repository.appendTurn(payload)

    return {
      schemaVersion: MEMORY_SCHEMA_V1_VERSION,
      storedTurnId: record.turnId,
      syncCheckpoint: 0,
    }
  })

  defineInvokeHandler(params.context, electronMemoryGetSyncState, async (payload) => {
    return mapSyncState(payload.scope, params.repository.getSyncState(payload), params.runtime)
  })
}
