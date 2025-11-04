import type { AiriEvent } from './types'

import { Client } from '@proj-airi/server-sdk'

/**
 * Airi Channel Server Client
 */
export class AiriClient {
  private client: Client | null = null

  /**
   * Connect to Channel Server
   */
  async connect(): Promise<boolean> {
    try {
      this.client = new Client({ name: 'proj-airi:plugin-vscode-companion' })

      console.log('Airi companion connected to Channel Server')
      return true
    }
    catch (error) {
      console.error('Failed to connect to Airi Channel Server:', error)
      return false
    }
  }

  /**
   * Disconnect from Channel Server
   */
  disconnect(): void {
    if (this.client) {
      // 假设 Client 有 disconnect 或 close 方法
      this.client = null
      console.log('Airi companion disconnected')
    }
  }

  /**
   * Send event to Airi
   */
  sendEvent(event: AiriEvent): void {
    if (!this.client) {
      console.warn('Cannot send event: not connected to Airi Channel Server')
      return
    }

    try {
      // 发送编码上下文事件
      this.client.send({
        type: 'vscode:context',
        data: event,
      })

      console.log(`Sent event to Airi: ${event.type}`, event)
    }
    catch (error) {
      console.error('Failed to send event to Airi:', error)
    }
  }

  /**
   * Is connected to Channel Server
   */
  isConnected(): boolean {
    return !!this.client
  }
}
