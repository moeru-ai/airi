import type {
  CreateMemoryGatewayOptions,
  MemoryAppendTurnResult,
  MemoryGateway,
  MemoryPromptContext,
  MemorySyncStateResult,
} from './types'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'

import {
  electronMemoryAppendTurn,
  electronMemoryGetSyncState,
  electronMemoryReadPromptContext,
} from '../../../../../apps/stage-tamagotchi/src/shared/eventa/memory'

function getDesktopIpcRenderer(override?: CreateMemoryGatewayOptions['ipcRenderer']) {
  if (override)
    return override

  const win = globalThis.window as undefined | { electron?: { ipcRenderer?: unknown } }
  return win?.electron?.ipcRenderer
}

function normalizePromptContext(result: Partial<MemoryPromptContext> & Pick<MemoryPromptContext, 'schemaVersion' | 'scope'>): MemoryPromptContext {
  return {
    memoryCards: result.memoryCards ?? [],
    profileSummary: result.profileSummary ?? null,
    recentTurns: result.recentTurns ?? [],
    schemaVersion: result.schemaVersion,
    scope: result.scope,
    stableFacts: result.stableFacts ?? [],
  }
}

function normalizeAppendTurnResult(result: Partial<MemoryAppendTurnResult> & Pick<MemoryAppendTurnResult, 'schemaVersion' | 'storedTurnId' | 'syncCheckpoint'>): MemoryAppendTurnResult {
  return {
    schemaVersion: result.schemaVersion,
    storedTurnId: result.storedTurnId,
    syncCheckpoint: result.syncCheckpoint,
  }
}

function normalizeSyncStateResult(result: Partial<MemorySyncStateResult> & Pick<MemorySyncStateResult, 'schemaVersion' | 'scope'>): MemorySyncStateResult {
  return {
    runtimeMode: result.runtimeMode ?? 'desktop-local-sqlite',
    schemaVersion: result.schemaVersion,
    scope: result.scope,
    syncMode: result.syncMode ?? 'enabled',
    syncModeReason: result.syncModeReason ?? null,
    syncState: result.syncState ?? null,
  }
}

/**
 * Creates the desktop memory gateway backed by Electron renderer Eventa invokes.
 *
 * Use when:
 * - stage-ui runs inside the desktop renderer and needs access to main-process memory
 * - callers want a shared memory interface without coupling to raw Eventa invoke contracts
 *
 * Expects:
 * - Electron `ipcRenderer` is available either through `options.ipcRenderer` or `window.electron.ipcRenderer`
 *
 * Returns:
 * - A shared `MemoryGateway` that forwards to the desktop memory invoke contracts
 */
export function createDesktopMemoryGateway(options: Pick<CreateMemoryGatewayOptions, 'ipcRenderer'> = {}): MemoryGateway {
  const ipcRenderer = getDesktopIpcRenderer(options.ipcRenderer)

  if (!ipcRenderer) {
    throw new Error('Desktop memory gateway requires an Electron ipcRenderer transport.')
  }

  const { context } = createContext(ipcRenderer as never)

  const readPromptContextInvoke = defineInvoke(context, electronMemoryReadPromptContext)
  const appendTurnInvoke = defineInvoke(context, electronMemoryAppendTurn)
  const getSyncStateInvoke = defineInvoke(context, electronMemoryGetSyncState)

  return {
    async appendTurn(input) {
      return normalizeAppendTurnResult(await appendTurnInvoke(input) as MemoryAppendTurnResult)
    },
    async getSyncState(input) {
      return normalizeSyncStateResult(await getSyncStateInvoke(input) as MemorySyncStateResult)
    },
    async readPromptContext(input) {
      return normalizePromptContext(await readPromptContextInvoke(input) as MemoryPromptContext)
    },
  }
}
