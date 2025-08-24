/**
 * Conditional loader for Ollama API
 * This module provides safe loading of Ollama API only in appropriate environments
 */

import type { ModelInfo } from '../stores/providers'
// Check if Tauri is available
const _isTauriAvailable = typeof window !== 'undefined' && '__TAURI__' in window

// Re-export constants and types from ollama-api
export type { OllamaPullProgress } from './ollama-api'
// Moved from ollama-api.ts to avoid direct import issues
export const POPULAR_OLLAMA_MODELS = [
  {
    name: 'Meta-Llama-3-8B-Instruct.Q4_K_M.gguf',
    displayName: '🌟 LLaMA 3 8B-Instruct Q4_K_M',
    description: 'Рекомендуемая модель Meta LLaMA 3 8B с квантизацией Q4_K_M для оптимального баланса качества и производительности',
    size: '4.92 GB',
    tags: ['recommended', 'balanced', 'meta'],
    huggingfaceRepo: 'QuantFactory/Meta-Llama-3-8B-Instruct-GGUF',
    filename: 'Meta-Llama-3-8B-Instruct.Q4_K_M.gguf',
  },
]

export interface OllamaAPIInterface {
  listModels(): Promise<any[]>
  pullModel(modelName: string, onProgress?: (progress: any) => void): Promise<void>
  downloadModel(modelName: string, onProgress?: (progress: any) => void): Promise<void>
  loadLocalModel(modelName: string, onProgress?: (progress: any) => void): Promise<void>
}

/**
 * Get Ollama API instance if available
 */
export async function getOllamaAPI(): Promise<OllamaAPIInterface | null> {
  try {
    // Only load the full Ollama API in appropriate environments
    if (typeof window !== 'undefined') {
      const { OllamaAPI } = await import('./ollama-api')
      return new OllamaAPI()
    }
    return null
  } catch (error) {
    console.warn('Failed to load Ollama API:', error)
    return null
  }
}

/**
 * Mock Ollama API for environments where it's not available
 */
export class MockOllamaAPI implements OllamaAPIInterface {
  async listModels(): Promise<any[]> {
    console.warn('Ollama API not available in this environment')
    return []
  }

  async pullModel(modelName: string, onProgress?: (progress: any) => void): Promise<void> {
    console.warn('Ollama API not available in this environment')
    onProgress?.({ status: 'Ollama not available' })
  }

  async downloadModel(modelName: string, onProgress?: (progress: any) => void): Promise<void> {
    console.warn('Ollama API not available in this environment')
    onProgress?.({ status: 'Ollama not available' })
  }

  async loadLocalModel(modelName: string, onProgress?: (progress: any) => void): Promise<void> {
    console.warn('Ollama API not available in this environment')
    onProgress?.({ status: 'Ollama not available' })
  }
}