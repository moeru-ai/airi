import type { Events } from './types'

import { useLogger } from '@guiiai/logg'
import { Client as ServerClient } from '@proj-airi/server-sdk'

export class Client {
  private client: ServerClient<Events> | null = null

  async connect(): Promise<boolean> {
    try {
      this.client = new ServerClient<Events>({ name: 'proj-airi:plugin-vscode' })
      await this.client.connect()
      useLogger().log('AIRI connected to Server Channel')
      return true
    }
    catch (error) {
      useLogger().errorWithError('Failed to connect to AIRI Server Channel:', error)
      return false
    }
  }

  disconnect(): void {
    if (this.client) {
      this.client.close()
      this.client = null
      useLogger().log('AIRI disconnected')
    }
  }

  async sendEvent(event: Events): Promise<void> {
    if (!this.client) {
      useLogger().warn('Cannot send event: not connected to AIRI Server Channel')
      return
    }

    try {
      await this.client.connect()
      this.client.send({ type: 'vscode:context', data: event })

      useLogger().log(`Sent event to AIRI: ${event.type}`, event)
    }
    catch (error) {
      useLogger().errorWithError('Failed to send event to AIRI:', error)
    }
  }

  isConnected(): boolean {
    return !!this.client
  }
}
