import type { AiriEvent } from './types'

import { Client } from '@proj-airi/server-sdk'

/**
 * Airi Channel Server 客户端
 */
export class AiriClient {
  private client: Client | null = null

  /**
   * 连接到 Channel Server
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
   * 断开连接
   */
  disconnect(): void {
    if (this.client) {
      // 假设 Client 有 disconnect 或 close 方法
      this.client = null
      console.log('Airi companion disconnected')
    }
  }

  /**
   * 发送事件到 Airi
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
}
