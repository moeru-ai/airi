import type { Events } from './types'

import { useLogger } from '@guiiai/logg'
import { Client as ServerClient } from '@proj-airi/server-sdk'

/**
 * Airi Channel Server Client
 */
export class Client {
  private client: ServerClient<Events> | null = null

  /**
   * Connect to Channel Server
   */
  async connect(): Promise<boolean> {
    try {
      this.client = new ServerClient({ name: 'proj-airi:plugin-vscode' })

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
      this.client.close()
      this.client = null
      useLogger().log('Airi companion disconnected')
    }
  }

  /**
   * Send event to Airi
   */
  sendEvent(event: Events): void {
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
