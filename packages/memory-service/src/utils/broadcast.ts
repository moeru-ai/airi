import type { WebSocket as ElysiaWebSocket } from 'ws'

import type { SettingsService } from '../services/settings'

export const localRegenerationClients = new Set<ElysiaWebSocket>()

export interface ConnectionPublisher {
  publish: (topic: string, data: any) => Promise<void>
}

export const wsPublisher: ConnectionPublisher = {
  async publish(topic: string, message: any): Promise<void> {
    for (const client of localRegenerationClients) {
      if (client.readyState === client.OPEN) {
        client.send(message)
      }
    }
  },
}

// Helper to broadcast regeneration status
export async function broadcastRegenerationStatus(
  publisher: ConnectionPublisher,
  settingsService: SettingsService,
) {
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
    const topic = 'regeneration_status'
    await publisher.publish(topic, message)
  }
  catch (error) {
    console.error('Failed to broadcast regeneration status:', error)
  }
}
