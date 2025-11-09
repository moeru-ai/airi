import process from 'node:process'

import { consola } from 'consola'

const MEMORY_API_URL = process.env.MEMORY_API_URL || 'http://localhost:3001/api'

export class MemoryClient {
  private apiUrl: string

  constructor(apiUrl: string = MEMORY_API_URL) {
    this.apiUrl = apiUrl
    consola.info(`MemoryClient initialized with API URL: ${this.apiUrl}`)
  }

  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    try {
      const response = await fetch(`${this.apiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(
          `API request failed with status ${response.status}: ${errorBody}`,
        )
      }

      return response.json() as Promise<T>
    }
    catch (error) {
      consola.error(`Error during API request to ${endpoint}:`, error)
      throw error
    }
  }

  async getStructuredContext(
    message: string,
    modelName?: string,
  ): Promise<any | null> {
    try {
      const context = await this.post<any>('/context/structured', {
        message,
        modelName,
      })
      return context
    }
    catch (error) {
      consola.error('Failed to get structured context:', error)
      return null
    }
  }

  async getContext(
    message: string,
    modelName?: string,
  ): Promise<string | null> {
    try {
      const context = await this.post<string>('/context', {
        message,
        modelName,
      })
      return context
    }
    catch (error) {
      consola.error('Failed to get context:', error)
      return null
    }
  }

  async ingestMessage(
    content: string,
    platform: string,
    modelName?: string,
  ): Promise<void> {
    try {
      await this.post('/messages', { content, platform, modelName })
    }
    catch (error) {
      consola.error('Failed to ingest message:', error)
    }
  }

  async storeCompletion(
    prompt: string,
    response: string,
    platform: string,
    modelName?: string,
  ): Promise<void> {
    try {
      await this.post('/completions', {
        prompt,
        response,
        platform,
        modelName,
      })
    }
    catch (error) {
      consola.error('Failed to store completion:', error)
    }
  }
}

export const memoryClient = new MemoryClient()
