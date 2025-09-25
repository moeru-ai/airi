import type { SettingsService } from '../services/settings'

import { WebSocket } from 'ws'

// Track WebSocket clients interested in regeneration status
export const regenerationClients = new Set<WebSocket>()

// Helper to broadcast regeneration status
export async function broadcastRegenerationStatus(settingsService: SettingsService) {
  if (regenerationClients.size === 0)
    return

  try {
    const settings = await settingsService.getSettings()
    const status = {
      type: 'regeneration_status',
      data: {
        isRegenerating: settings.mem_is_regenerating,
        progress: settings.mem_regeneration_progress,
        totalItems: settings.mem_regeneration_total_items,
        processedItems: settings.mem_regeneration_processed_items,
        avgBatchTimeMs: settings.mem_regeneration_avg_batch_time_ms,
        lastBatchTimeMs: settings.mem_regeneration_last_batch_time_ms,
        currentBatchSize: settings.mem_regeneration_current_batch_size,
        estimatedTimeRemaining: settings.mem_regeneration_total_items > 0
          ? Math.round(
              (settings.mem_regeneration_total_items - settings.mem_regeneration_processed_items)
              * (settings.mem_regeneration_avg_batch_time_ms / settings.mem_regeneration_current_batch_size),
            )
          : null,
      },
    }

    const message = JSON.stringify(status)
    for (const client of regenerationClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    }
  }
  catch (error) {
    console.error('Failed to broadcast regeneration status:', error)
  }
}
