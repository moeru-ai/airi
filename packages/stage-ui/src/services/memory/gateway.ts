import type {
  CreateMemoryGatewayOptions,
  MemoryAppendTurnInput,
  MemoryAppendTurnResult,
  MemoryGateway,
  MemoryPromptContext,
  MemorySyncStateResult,
} from './types'

import { createDesktopMemoryGateway } from './desktop-gateway'

function createWebMemoryGateway(): MemoryGateway {
  return {
    async appendTurn(input: MemoryAppendTurnInput): Promise<MemoryAppendTurnResult> {
      return {
        schemaVersion: 0,
        storedTurnId: input.turnId,
        syncCheckpoint: 0,
      }
    },
    async getSyncState(input): Promise<MemorySyncStateResult> {
      return {
        runtimeMode: 'web-stub',
        schemaVersion: 0,
        scope: input.scope,
        syncMode: 'unavailable',
        syncModeReason: 'memory background sync unavailable',
        syncState: null,
      }
    },
    async readPromptContext(input): Promise<MemoryPromptContext> {
      return {
        memoryCards: [],
        profileSummary: null,
        recentTurns: [],
        schemaVersion: 0,
        scope: input.scope,
        stableFacts: [],
      }
    },
  }
}

/**
 * Creates the shared stage-ui memory gateway for the requested runtime.
 *
 * Use when:
 * - stage-ui needs one stable memory interface across desktop and web runtimes
 * - callers want desktop invokes hidden behind a shared gateway contract
 *
 * Expects:
 * - `runtime` selects either the desktop Eventa adapter or the web stub
 *
 * Returns:
 * - A runtime-specific `MemoryGateway`
 */
export function createMemoryGateway(options: CreateMemoryGatewayOptions): MemoryGateway {
  if (options.runtime === 'desktop') {
    return createDesktopMemoryGateway({ ipcRenderer: options.ipcRenderer })
  }

  return createWebMemoryGateway()
}

export type {
  CreateMemoryGatewayOptions,
  MemoryAppendTurnInput,
  MemoryAppendTurnResult,
  MemoryCard,
  MemoryGateway,
  MemoryPromptContext,
  MemoryRecentTurn,
  MemoryScope,
  MemoryStableFact,
  MemorySyncState,
  MemorySyncStateResult,
} from './types'
