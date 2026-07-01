import { defineInvokeEventa } from '@moeru/eventa'

export interface OpenAICompatibleFetchRequest {
  url: string
  baseUrl: string
  method?: string
  headers?: Record<string, string>
  body?: string
}

export interface OpenAICompatibleFetchResponse {
  type: 'head'
  status: number
  statusText: string
  headers: Record<string, string>
}

export interface OpenAICompatibleFetchChunk {
  type: 'chunk'
  chunk: Uint8Array
}

export type OpenAICompatibleFetchStreamEvent = OpenAICompatibleFetchResponse | OpenAICompatibleFetchChunk

export const openAICompatibleFetch = defineInvokeEventa<OpenAICompatibleFetchStreamEvent, OpenAICompatibleFetchRequest>('eventa:invoke:electron:openai-compatible:fetch')
