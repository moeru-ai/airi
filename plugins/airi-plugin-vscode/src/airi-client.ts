import type { AiriEvent } from './types'

import { useLogger } from '@guiiai/logg'
import { Client } from '@proj-airi/server-sdk'

/**
 * Airi Channel Server Client
 */
export class AiriClient {
  private client: Client<AiriEvent> | null = null

  /**
   * Connect to Channel Server
   */
  async connect(): Promise<boolean> {
    try {
      this.client = new Client({ name: 'proj-airi:plugin-vscode' })

      useLogger().log('Airi companion connected to Channel Server')
      return true
    }
    catch (error) {
      useLogger().errorWithError('Failed to connect to Airi Channel Server:', error)
      return false
    }
  }

  /**
   * Disconnect from Channel Server
   */
  disconnect(): void {
    if (this.client) {
      // TODO: Pretend there is a disconnect method in Client
      this.client = null
      useLogger().log('Airi companion disconnected')
    }
  }

  /**
   * Send event to Airi
   */
  sendEvent(event: AiriEvent): void {
    if (!this.client) {
      useLogger().warn('Cannot send event: not connected to Airi Channel Server')
      return
    }

    try {
      // Send event to Airi
      this.client.send({
        type: 'vscode:context',
        data: event,
      })

      useLogger().log(`Sent event to Airi: ${event.type}`, event)
    }
    catch (error) {
      useLogger().errorWithError('Failed to send event to Airi:', error)
    }
  }

  /**
   * Is connected to Channel Server
   */
  isConnected(): boolean {
    return !!this.client
  }
}
