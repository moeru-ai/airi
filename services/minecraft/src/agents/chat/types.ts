import type { Neuri } from 'neuri'

export interface ChatHistory {
  sender: string
  message: string
  timestamp: number
}

export interface ChatContext {
  player: string
  startTime: number
  lastUpdate: number
  history: ChatHistory[]
}

export interface ChatAgentConfig {
  id: string
  type: 'chat'
  llm: {
    agent: Neuri
    model?: string
  }
  maxHistoryLength?: number
  idleTimeout?: number
}
