import type { SatoriMessageCreateRequest, SatoriMessageCreateResponse } from '../types/satori'

import { useLogg } from '@guiiai/logg'

const log = useLogg('SatoriAPI')

export interface SatoriAPIConfig {
  baseUrl: string
  token?: string
  platform: string
  selfId: string
}

export class SatoriAPI {
  private config: SatoriAPIConfig

  constructor(config: SatoriAPIConfig) {
    this.config = config
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Satori-Platform': this.config.platform,
      'Satori-User-ID': this.config.selfId,
    }

    if (this.config.token) {
      headers.Authorization = `Bearer ${this.config.token}`
    }

    return headers
  }

  private async request<T>(
    endpoint: string,
    body?: any,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      return await response.json() as T
    }
    catch (error) {
      log.withError(error as Error).error(`Failed to call ${endpoint}`)
      throw error
    }
  }

  async sendMessage(
    channelId: string,
    content: string,
  ): Promise<SatoriMessageCreateResponse[]> {
    const body: SatoriMessageCreateRequest = {
      channel_id: channelId,
      content,
    }

    log.log(`Sending message to channel ${channelId}: ${content}`)
    return await this.request<SatoriMessageCreateResponse[]>('/message.create', body)
  }

  async getMessage(channelId: string, messageId: string): Promise<any> {
    return await this.request('/message.get', {
      channel_id: channelId,
      message_id: messageId,
    })
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    await this.request('/message.delete', {
      channel_id: channelId,
      message_id: messageId,
    })
  }

  async updateMessage(channelId: string, messageId: string, content: string): Promise<void> {
    await this.request('/message.update', {
      channel_id: channelId,
      message_id: messageId,
      content,
    })
  }
}
