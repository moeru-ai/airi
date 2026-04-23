import type { ArtistryJob, ArtistryJobStatus, ArtistryProvider, ArtistryRequest } from './base'

import { Buffer } from 'node:buffer'

import { useLogg } from '@guiiai/logg'

const log = useLogg('providers-comfyui').useGlobalConfig()

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 1000 * 60 * 5 // 5 minutes

export class ComfyUIProvider implements ArtistryProvider {
  readonly id = 'comfyui'
  readonly name = 'ComfyUI (Local)'

  private serverUrl = 'http://localhost:8188'
  private savedWorkflows: any[] = []
  private activeWorkflowId = ''

  private jobResults = new Map<string, ArtistryJobStatus>()
  private callbacks = new Map<string, (status: ArtistryJobStatus) => void>()

  private async fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 30000) {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      clearTimeout(id)
      return response
    }
    catch (error) {
      clearTimeout(id)
      throw error
    }
  }

  setJobCallback(jobId: string, callback: (status: ArtistryJobStatus) => void) {
    this.callbacks.set(jobId, callback)
    // If we already have a result, fire it immediately
    const result = this.jobResults.get(jobId)
    if (result)
      callback(result)
  }

  private updateStatus(jobId: string, status: ArtistryJobStatus) {
    this.jobResults.set(jobId, status)
    const callback = this.callbacks.get(jobId)
    if (callback)
      callback(status)
  }

  async initialize(config: any): Promise<void> {
    if (config?.comfyuiServerUrl)
      this.serverUrl = config.comfyuiServerUrl.replace(/\/+$/, '') // strip trailing slashes
    if (config?.comfyuiSavedWorkflows)
      this.savedWorkflows = config.comfyuiSavedWorkflows
    if (config?.comfyuiActiveWorkflow)
      this.activeWorkflowId = config.comfyuiActiveWorkflow
  }

  async generate(request: ArtistryRequest): Promise<ArtistryJob> {
    const jobId = request.extra?.internalJobId || Math.random().toString(36).slice(2)

    // Resolve which workflow template to use --- per-request template override takes precedence over card model default
    const templateId = request.extra?.template || request.model || this.activeWorkflowId
    const template = this.savedWorkflows.find((w: any) => w.id === templateId)

    if (!template) {
      this.updateStatus(jobId, {
        status: 'failed',
        error: 'No workflow template configured. Upload a workflow in Settings > Providers > ComfyUI.',
        actionLabel: 'Error: No workflow configured',
      })
      return { jobId, providerJobId: jobId }
    }

    // Start async generation
    this.pollForResult(jobId, template, request)

    return { jobId, providerJobId: jobId }
  }

  private async pollForResult(
    jobId: string,
    template: { workflow: Record<string, any>, exposedFields: Record<string, string[]> },
    request: ArtistryRequest,
  ) {
    this.updateStatus(jobId, { status: 'running', actionLabel: 'Preparing workflow...' })

    try {
      // 0. Handle potential image and prompt upload bidirectional flow
      const extraStr = JSON.stringify(request.extra || {})
      const workflowStr = JSON.stringify(template.workflow || {})
      const hasImagePlaceholder = extraStr.includes('{{IMAGE}}') || workflowStr.includes('{{IMAGE}}')
      const hasPromptPlaceholder = extraStr.includes('{{PROMPT}}') || workflowStr.includes('{{PROMPT}}')

      let uploadedImageName = ''
      if (hasImagePlaceholder && request.extra?.image) {
        log.log(`[ComfyUI] Bidirectional flow detected. Uploading texture for job ${jobId}...`)
        this.updateStatus(jobId, { status: 'running', actionLabel: 'Uploading texture to ComfyUI...' })
        try {
          uploadedImageName = await this.uploadImage(request.extra.image)
          log.log(`[ComfyUI] Texture uploaded as: ${uploadedImageName}`)
        }
        catch (e: any) {
          log.error(`[ComfyUI] Texture upload failed: ${e.message}`)
        }
      }

      // 1. Apply overrides to the workflow template (standard injection)
      let resolvedPrompt = this.applyOverrides(template, request)

      // 2. Perform final placeholder resolution across the ENTIRE resolved prompt
      if (hasImagePlaceholder || hasPromptPlaceholder) {
        log.log(`[ComfyUI] Performing final placeholder resolution for ${jobId}...`)
        const replacements: Record<string, string> = {
          '{{PROMPT}}': request.prompt || '',
        }
        if (uploadedImageName) {
          replacements['{{IMAGE}}'] = uploadedImageName
        }

        resolvedPrompt = this.replacePlaceholders(resolvedPrompt, replacements)
      }

      log.log(`[ComfyUI] Resolved prompt for ${jobId}:`, JSON.stringify(resolvedPrompt, null, 2))

      // 2. POST /prompt to queue the workflow
      this.updateStatus(jobId, { status: 'running', actionLabel: 'Queuing in ComfyUI...' })

      let queueResp: Response
      try {
        queueResp = await this.fetchWithTimeout(`${this.serverUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: resolvedPrompt }),
        }, 15000)
      }
      catch (e: any) {
        throw new Error(`Cannot connect to ComfyUI at ${this.serverUrl}: ${e.message}`)
      }

      if (!queueResp.ok) {
        const errorBody = await queueResp.text()
        throw new Error(`Workflow error: ${errorBody.slice(0, 200)}`)
      }

      const queueData = await queueResp.json()
      const promptId = queueData.prompt_id
      if (!promptId) {
        throw new Error('ComfyUI returned no prompt_id')
      }

      log.log(`[ComfyUI] Queued prompt ${promptId} for job ${jobId}`)
      this.updateStatus(jobId, { status: 'running', actionLabel: 'Generating...' })

      // 3. Poll /history/{prompt_id} until completion
      let historyDone = false
      let attempt = 0
      const startTime = Date.now()

      while (!historyDone) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
        attempt++

        if (Date.now() - startTime > POLL_TIMEOUT_MS) {
          throw new Error('Generation timed out after 5 minutes')
        }

        if (attempt % 3 === 0) {
          log.log(`[ComfyUI] Polling history for ${promptId}... attempt ${attempt}`)
        }

        let histResp: Response
        try {
          histResp = await this.fetchWithTimeout(`${this.serverUrl}/history/${promptId}`, {}, 10000)
        }
        catch (e: any) {
          throw new Error(`ComfyUI disconnected during polling: ${e.message}`)
        }

        if (histResp.ok) {
          const histData = await histResp.json()
          if (histData[promptId]) {
            let outputs = histData[promptId].outputs
            const stats = histData[promptId].status

            // 3.1. Race condition protection: If outputs are missing, wait a beat and retry once
            if ((!outputs || Object.keys(outputs).length === 0) && !historyDone) {
              log.warn(`[ComfyUI] Job ${jobId} finished but outputs are empty. Retrying history in 1s...`)
              await new Promise(r => setTimeout(r, 1000))
              const retryResp = await this.fetchWithTimeout(`${this.serverUrl}/history/${promptId}`, {}, 10000)
              if (retryResp.ok) {
                const retryData = await retryResp.json()
                if (retryData[promptId] && retryData[promptId].outputs) {
                  log.log(`[ComfyUI] Retry successful for ${jobId}. Managed to find outputs!`)
                  outputs = retryData[promptId].outputs
                }
              }
            }

            // Log raw history if no images found or if there are status messages
            if (stats?.messages && stats.messages.length > 0) {
              log.warn(`[ComfyUI] History messages for ${promptId}:`, stats.messages)
            }

            // Find first image in any node's output
            for (const nodeId in outputs) {
              const nodeOutput = outputs[nodeId]
              if (nodeOutput.images && nodeOutput.images.length > 0) {
                const img = nodeOutput.images[0]
                const imageUrl = `${this.serverUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`
                log.log(`[ComfyUI] Generation complete for job ${jobId}. Image: ${imageUrl}`)
                this.updateStatus(jobId, { status: 'succeeded', progress: 100, imageUrl })
                historyDone = true
                break
              }
            }

            // Job finished but no images
            if (!historyDone) {
              log.error(`[ComfyUI] Job finished for ${jobId} (Prompt ${promptId}) but no output images found. Raw History:`, JSON.stringify(histData[promptId], null, 2))
              this.updateStatus(jobId, {
                status: 'failed',
                error: 'Job completed but no images were generated',
                actionLabel: 'Error: No images generated',
              })
              historyDone = true
            }
          }
        }
      }
    }
    catch (error: any) {
      const errorMessage = error.message || String(error)
      log.error(`[ComfyUI] Generation failed for job ${jobId}: ${errorMessage}`)
      this.updateStatus(jobId, {
        status: 'failed',
        error: errorMessage,
        actionLabel: `Error: ${errorMessage.slice(0, 50)}${errorMessage.length > 50 ? '...' : ''}`,
      })
    }
    finally {
      // Clean up callback and job result after completion to prevent memory leaks
      setTimeout(() => {
        this.callbacks.delete(jobId)
        this.jobResults.delete(jobId)
      }, 10000)
    }
  }

  /**
   * Apply request overrides to a workflow template.
   * Matches nodes by _meta.title and overwrites exposed input fields.
   * Mirrors the logic from CUIPP's getComfyTemplate.js.
   */
  private applyOverrides(
    template: { workflow: Record<string, any>, exposedFields: Record<string, string[]> },
    request: ArtistryRequest,
  ): Record<string, any> {
    // Deep clone the workflow so we don't mutate the stored template
    const prompt = JSON.parse(JSON.stringify(template.workflow))

    // Build overrides from the request
    const overrides: Record<string, Record<string, any>> = {}

    // The main prompt text goes into the first exposed "text" field we find
    // COMPAT: If the user ALREADY used a {{PROMPT}} placeholder in the extra params, we skip this auto-injection
    const hasPromptPlaceholder = JSON.stringify(request.extra).includes('{{PROMPT}}')
    if (request.prompt && !hasPromptPlaceholder) {
      for (const [nodeTitle, fields] of Object.entries(template.exposedFields)) {
        if (fields.includes('text')) {
          if (!overrides[nodeTitle])
            overrides[nodeTitle] = {}
          overrides[nodeTitle].text = request.prompt
          break // Only inject into the first text field
        }
      }
    }

    // Merge in any explicit per-node overrides from request.extra
    // We skip known reserved keys and look for keys that might be node titles
    const reservedKeys = ['template', 'internalJobId', 'remixId', 'options']
    if (request.extra) {
      for (const [key, value] of Object.entries(request.extra)) {
        if (reservedKeys.includes(key))
          continue

        // If it's an object, treat it as a potential node override
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          if (!overrides[key])
            overrides[key] = {}
          Object.assign(overrides[key], value)
        }
      }
    }

    // Still support legacy .options nesting just in case
    if (request.extra?.options) {
      for (const [nodeTitle, fields] of Object.entries(request.extra.options as Record<string, Record<string, any>>)) {
        if (!overrides[nodeTitle])
          overrides[nodeTitle] = {}
        Object.assign(overrides[nodeTitle], fields)
      }
    }

    // Apply overrides to matching nodes
    for (const nodeId in prompt) {
      const node = prompt[nodeId]
      const title = node._meta?.title
      if (title && overrides[title]) {
        const nodeOverrides = overrides[title]
        for (const [field, value] of Object.entries(nodeOverrides)) {
          // Only override exposed fields (security boundary)
          if (template.exposedFields[title]?.includes(field)) {
            node.inputs[field] = value
          }
        }
      }
    }

    // Auto-randomize seed if it's exposed and not explicitly set
    for (const [nodeTitle, fields] of Object.entries(template.exposedFields)) {
      if (fields.includes('seed') && (overrides[nodeTitle]?.seed === undefined || overrides[nodeTitle]?.seed === null)) {
        for (const nodeId in prompt) {
          const node = prompt[nodeId]
          if (node._meta?.title === nodeTitle) {
            node.inputs.seed = Math.floor(Math.random() * 1e15)
            break
          }
        }
      }
    }

    return prompt
  }

  async getStatus(jobId: string): Promise<ArtistryJobStatus> {
    return this.jobResults.get(jobId) || { status: 'queued' }
  }

  private async uploadImage(base64Data: string): Promise<string> {
    // 1. Clean data URL prefix if present
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')

    // 2. Prepare multipart form data
    const formData = new FormData()
    const fileName = `vhack_${Date.now()}.png`

    // Electron/Node 18+ fetch handles Blobs in FormData
    const blob = new Blob([buffer], { type: 'image/png' })
    formData.append('image', blob, fileName)
    formData.append('overwrite', 'true')

    const response = await this.fetchWithTimeout(`${this.serverUrl}/upload/image`, {
      method: 'POST',
      body: formData,
    }, 60000) // 1 minute timeout for uploads

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`ComfyUI upload failed: ${error}`)
    }

    const data = await response.json()
    return data.name // Returns the filename in ComfyUI's input folder
  }

  private replacePlaceholders(obj: any, replacements: Record<string, string>): any {
    if (typeof obj === 'string') {
      let result = obj
      for (const [placeholder, value] of Object.entries(replacements)) {
        result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'g'), value)
      }
      return result
    }

    if (Array.isArray(obj))
      return obj.map(item => this.replacePlaceholders(item, replacements))

    if (obj !== null && typeof obj === 'object') {
      const newObj: any = {}
      for (const [key, value] of Object.entries(obj)) {
        newObj[key] = this.replacePlaceholders(value, replacements)
      }
      return newObj
    }
    return obj
  }
}
