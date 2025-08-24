import type { ModelInfo } from '../stores/providers'
import { POPULAR_OLLAMA_MODELS } from './ollama-api-loader'

export interface OllamaModel {
  name: string
  model: string
  modified_at: string
  size: number
  digest: string
  details: {
    parent_model: string
    format: string
    family: string
    families: string[]
    parameter_size: string
    quantization_level: string
  }
}

export interface OllamaPullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
}

export interface OllamaPullResponse {
  status: string
  digest?: string
  total?: number
  completed?: number
}

export class OllamaAPI {
  public baseUrl: string
  public headers: Record<string, string>

  constructor(baseUrl: string, headers: Record<string, string> = {}) {
    // Remove /v1/ suffix if present for direct API calls
    this.baseUrl = baseUrl.replace(/\/v1\/?$/, '')
    this.headers = headers
  }

  /**
   * Get list of available models from Ollama
   */
  async listModels(): Promise<OllamaModel[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`, {
      headers: this.headers,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`)
    }

    const data = await response.json()
    return data.models || []
  }

  /**
   * Download a model from HuggingFace repository
   */
  async pullModel(modelName: string, onProgress?: (progress: OllamaPullProgress) => void, abortSignal?: AbortSignal): Promise<void> {
    // Find model info from POPULAR_OLLAMA_MODELS
    const modelInfo = POPULAR_OLLAMA_MODELS.find(model => model.name === modelName)
    if (!modelInfo) {
      throw new Error(`Model ${modelName} not found in available models`)
    }

    const downloadUrl = `https://huggingface.co/${modelInfo.huggingfaceRepo}/resolve/main/${modelInfo.filename}`
    const projectRoot = await this.getProjectRoot()
    const filePath = `${projectRoot}/${modelInfo.filename}`

    try {
      onProgress?.({ status: 'Starting download from HuggingFace...' })

      const response = await fetch(downloadUrl, {
        signal: abortSignal,
      })

      if (!response.ok) {
        throw new Error(`Failed to download model: ${response.statusText}`)
      }

      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : 0

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      let completed = 0
      const chunks: Uint8Array[] = []

      onProgress?.({ status: 'downloading', total, completed })

      while (true) {
        if (abortSignal?.aborted) {
          throw new Error('Download cancelled by user')
        }

        const { done, value } = await reader.read()
        if (done) break

        chunks.push(value)
        completed += value.length

        onProgress?.({ status: 'downloading', total, completed })
      }

      onProgress?.({ status: 'saving file...' })

      // Combine all chunks into a single Uint8Array
      const fileData = new Uint8Array(completed)
      let offset = 0
      for (const chunk of chunks) {
        fileData.set(chunk, offset)
        offset += chunk.length
      }

      // Save file using Tauri API
      await this.saveFile(filePath, fileData)

      onProgress?.({ status: 'success', total, completed })
    }
    catch (error) {
      if (error instanceof Error && error.message.includes('cancelled')) {
        throw error
      }
      throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get project root directory
   */
  private async getProjectRoot(): Promise<string> {
    // Return path to models folder in project root
    return './models'
  }



  /**
   * Save file to local filesystem using Tauri API
   */
  private async saveFile(filePath: string, data: Uint8Array): Promise<void> {
    // Check if Tauri is available
    const isTauriAvailable = typeof window !== 'undefined' && '__TAURI__' in window
    
    if (isTauriAvailable) {
      try {
        // Dynamic import only when Tauri is available
        const tauriFs = await import(/* @vite-ignore */ '@tauri-apps/api/fs')
        
        // Get filename from path
        const filename = filePath.split('/').pop() || 'model.gguf'
        
        // Write file to models directory
        await tauriFs.writeFile(filename, data, { dir: 'models' })
        return
      } catch (error) {
        console.warn('Failed to save file with Tauri API:', error)
      }
    }
    
    // Fallback to browser download if Tauri is not available
    const blob = new Blob([data])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filePath.split('/').pop() || 'model.gguf'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * Load model from local file into Ollama server
   */
  async loadLocalModel(modelName: string, onProgress?: (progress: OllamaPullProgress) => void): Promise<void> {
    if (!isTauriAvailable()) {
      throw new Error('Local model loading is only available in Tauri environment')
    }
    
    try {
      onProgress?.({ status: 'Loading model from local file...' })
      
      // Get Tauri filesystem API
      const tauriFs = await getTauriFileSystem()
      if (!tauriFs) {
        throw new Error('Failed to load Tauri filesystem API')
      }
      
      // Read model file from models directory
      const _modelData = await tauriFs.readBinaryFile(`models/${modelName}`)
      
      onProgress?.({ status: 'Uploading model to Ollama server...' })
      
      // Create Modelfile for the model
      const modelfile = `FROM ${modelName}`
      
      // Use Tauri invoke to create model in Ollama
      const tauriCore = await getTauriCore()
      if (!tauriCore) {
        throw new Error('Tauri core API not available')
      }
      
      try {
        await tauriCore.invoke('ollama_create_model', {
          name: modelName.replace('.gguf', ''),
          modelfile,
          stream: false
        })
      } catch (error) {
        throw new Error(`Failed to create model in Ollama: ${error}`)
      }
      
      onProgress?.({ status: 'Model loaded successfully!' })
    } catch (error) {
      throw new Error(`Failed to load local model: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Legacy method for Ollama registry (kept for compatibility)
   */
  async pullModelFromOllama(modelName: string, onProgress?: (progress: OllamaPullProgress) => void, abortSignal?: AbortSignal): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify({
        name: modelName,
        stream: true,
      }),
      signal: abortSignal,
    })

    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error('No response body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        // Check if abort was requested
        if (abortSignal?.aborted) {
          throw new Error('Download cancelled by user')
        }

        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
          try {
            const progress: OllamaPullProgress = JSON.parse(line)
            onProgress?.(progress)

            // Check for completion or error
            if (progress.status === 'success') {
              return
            }
            if (progress.status.includes('error')) {
              throw new Error(`Pull failed: ${progress.status}`)
            }
          } catch (_parseError) {
          // Skip invalid JSON lines
          console.warn('Failed to parse progress line:', line)
          }
        }
      }
    }
    finally {
      reader.releaseLock()
    }
  }

  /**
   * Delete a model from Ollama
   */
  async deleteModel(modelName: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify({
        name: modelName,
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to delete model: ${response.statusText}`)
    }
  }

  /**
   * Check if Ollama server is reachable
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        headers: this.headers,
      })
      return response.ok
    }
    catch {
      return false
    }
  }

  /**
   * Check if a specific model exists locally
   */
  async checkModel(modelName: string): Promise<boolean> {
    try {
      const models = await this.listModels()
      return models.some(model => model.name === modelName)
    }
    catch {
      return false
    }
  }

  /**
   * Convert Ollama model to ModelInfo format
   */
  static toModelInfo(model: OllamaModel): ModelInfo {
    return {
      id: model.name,
      name: model.name,
      provider: 'ollama',
      description: `${model.details?.family || 'Unknown'} - ${model.details?.parameter_size || 'Unknown size'}`,
      contextLength: 0, // Ollama doesn't provide this info directly
      deprecated: false,
    }
  }
}

/**
 * Popular models that can be downloaded from HuggingFace
 */
// POPULAR_OLLAMA_MODELS moved to ollama-api-loader.ts to avoid import issues