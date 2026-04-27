import type { MemoryGateway, MemoryScope, MemorySyncStateResult } from './gateway'

import { isStageTamagotchi } from '@proj-airi/stage-shared'

import { createMemoryGateway } from './gateway'

export interface MemoryStatusSnapshot {
  runtimeMode: 'desktop-local-sqlite' | 'web-stub'
  runtimeLabel: string
  syncMode: 'enabled' | 'disabled' | 'unavailable'
  syncMessage: string
  lastUploadAt: number | null
  lastPullAt: number | null
  pendingTurnCount: number
  lastAppliedSummaryVersion: number | null
  lastError: string | null
}

function buildMemoryStatusSnapshot(result: MemorySyncStateResult): MemoryStatusSnapshot {
  const runtimeMode = result.runtimeMode ?? 'desktop-local-sqlite'
  const syncMode = result.syncMode ?? (runtimeMode === 'web-stub' ? 'unavailable' : 'enabled')
  const syncMessage = result.syncModeReason
    ?? (syncMode === 'enabled'
      ? 'Background sync active'
      : syncMode === 'disabled'
        ? 'Background sync disabled'
        : 'Memory background sync unavailable')

  return {
    lastAppliedSummaryVersion: result.syncState?.lastAppliedSummaryVersion ?? null,
    lastError: result.syncState?.lastError ?? null,
    lastPullAt: result.syncState?.lastPullAt ?? null,
    lastUploadAt: result.syncState?.lastUploadAt ?? null,
    pendingTurnCount: result.syncState?.pendingTurnCount ?? 0,
    runtimeLabel: runtimeMode === 'desktop-local-sqlite' ? 'Local-First Memory' : 'Memory unavailable',
    runtimeMode,
    syncMessage,
    syncMode,
  }
}

/**
 * Reads and normalizes memory sync status for read-only UI surfaces.
 *
 * Use when:
 * - A settings page or diagnostic surface needs a stable memory status snapshot
 * - Callers want one normalized shape across desktop and web stub runtimes
 *
 * Expects:
 * - `scope` is stable enough for the current UI surface
 * - `gateway.getSyncState()` may legitimately return `null` nested state
 *
 * Returns:
 * - A normalized read-only status snapshot suitable for direct rendering
 */
export async function readMemoryStatusSnapshot(params: {
  scope: MemoryScope
  gateway?: MemoryGateway
  runtime?: 'desktop' | 'web'
}) {
  const runtime = params.runtime ?? (isStageTamagotchi() ? 'desktop' : 'web')
  const gateway = params.gateway ?? createMemoryGateway({ runtime })
  const result = await gateway.getSyncState({ scope: params.scope })

  return buildMemoryStatusSnapshot(result)
}
