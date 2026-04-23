import type { createContext as createMainEventaContext } from '@moeru/eventa/adapters/electron/main'
import type { ProvidedBy } from 'injeca'

import type { artistryConfigSchema } from '../../../configs/artistry'
import type { Config } from '../../../libs/electron/persistence'
import type { WidgetsWindowManager } from '../../../windows/widgets'
import type { ArtistryProvider, ArtistryRequest } from './providers/base'

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import {
  artistryGenerateHeadless,
  artistrySyncConfig,
  artistryTestComfyUIConnection,
} from '@proj-airi/stage-shared'
import { injeca } from 'injeca'

import { ComfyUIProvider } from './providers/comfyui'
import { NanoBananaProvider } from './providers/nanobanana'
import { ReplicateProvider } from './providers/replicate'

const log = useLogg('artistry-bridge').useGlobalConfig()
const DEFAULT_REMIX_ID = '48250602'

interface ArtistrySyncSnapshot {
  provider?: string
  model?: string
  promptPrefix?: string
  options?: Record<string, any>
  globals?: Record<string, any>
}

interface TriggerConfig {
  provider?: string
  model?: string
  promptPrefix?: string
  options?: Record<string, any>
  globals?: Record<string, any>
}

function robustParse(input: unknown, context?: string): Record<string, unknown> {
  if (typeof input === 'object' && input !== null)
    return input as Record<string, unknown>
  if (typeof input === 'string' && input.trim()) {
    try {
      const parsed = JSON.parse(input)
      if (typeof parsed === 'object' && parsed !== null)
        return parsed as Record<string, unknown>
      log.warn(`[Artistry Bridge] robustParse(${context || 'unknown'}): Parsed JSON is not an object: ${typeof parsed}`)
      return {}
    }
    catch (e) {
      log.warn(`[Artistry Bridge] robustParse(${context || 'unknown'}): JSON parse failed: ${errorMessageFrom(e)} | Input: ${input.slice(0, 100)}`)
      return {}
    }
  }
  return {}
}

const lastTriggerMap = new Map<string, string>()
const activeRunMap = new Map<string, string>()

/**
 * Volatile storage for active character card artistry defaults.
 * Synced from the renderer App.vue whenever the character or settings change.
 */
const cardDefaults: ArtistrySyncSnapshot = {
  provider: undefined as string | undefined,
  model: undefined as string | undefined,
  promptPrefix: undefined as string | undefined,
  options: undefined as Record<string, unknown> | undefined,
  globals: undefined as Record<string, unknown> | undefined,
}

function createRunId(widgetId: string) {
  return `${widgetId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

async function downloadImageAsBase64(url: string): Promise<string> {
  try {
    log.log(`[Artistry Bridge] Downloading image from: ${url}`)
    const response = await fetch(url)
    if (!response.ok)
      throw new Error(`Failed to fetch image: ${response.statusText}`)
    const buffer = await response.arrayBuffer()
    return Buffer.from(buffer).toString('base64')
  }
  catch (error: unknown) {
    log.error(`[Artistry Bridge] Failed to download image: ${errorMessageFrom(error)}`)
    throw error
  }
}

function supportsJobCallback(provider: ArtistryProvider): provider is ArtistryProvider & Required<Pick<ArtistryProvider, 'setJobCallback'>> {
  return typeof provider.setJobCallback === 'function'
}

// Maintaining a registry of providers
export const artistryProviders = new Map<string, ArtistryProvider>()
artistryProviders.set('comfyui', new ComfyUIProvider())
artistryProviders.set('replicate', new ReplicateProvider())
artistryProviders.set('nanobanana', new NanoBananaProvider())

// Deduplication map for headless requests
const pendingHeadlessRequests = new Map<string, Promise<{ imageUrl?: string, base64?: string, error?: string }>>()

export async function generateHeadless(params: {
  prompt: string
  model?: string
  provider?: string
  options?: Record<string, any>
  globals?: Record<string, any>
}): Promise<{ imageUrl?: string, base64?: string, error?: string }> {
  // Resolve config and effective globals early to secure the deduplication fingerprint
  const { config: artistryConfig } = await injeca.resolve({ config: 'configs:artistry' } as { config: ProvidedBy<Config<typeof artistryConfigSchema>> })
  const activeGlobals = (params.globals || artistryConfig.get()?.artistryGlobals || {}) as Record<string, any>

  // Create a fingerprint for deduplication
  const sourceImage = activeGlobals?.image
  const imageHash = typeof sourceImage === 'string'
    ? createHash('sha256').update(sourceImage).digest('hex')
    : 'NONE'

  // We hash the globals (excluding the heavy image already covered by imageHash)
  // to ensure that changing a workflow or provider setting triggers a unique execution.
  const { image, ...globalsForFingerprint } = activeGlobals
  const globalsHash = createHash('sha256').update(JSON.stringify(globalsForFingerprint)).digest('hex')

  const fingerprint = JSON.stringify({
    p: params.prompt,
    m: params.model,
    pr: params.provider,
    o: params.options,
    ih: imageHash,
    gh: globalsHash, // Include globals hash (Issue #39)
  })

  if (pendingHeadlessRequests.has(fingerprint)) {
    log.log(`[Headless] Deduplicating identical request: ${params.prompt.slice(0, 30)}...`)
    return pendingHeadlessRequests.get(fingerprint)!
  }

  const executionPromise = (async () => {
    const requestedProvider = (params.provider || artistryConfig.get()?.artistryProvider || 'comfyui').trim().toLowerCase()
    const provider = artistryProviders.get(requestedProvider)
    if (!provider) {
      log.error(`[Headless] CRITICAL: Provider '${requestedProvider}' not found in registry! fallback to replicate`)
      throw new Error(`Provider '${requestedProvider}' not found.`)
    }

    // Initialize the provider
    if (provider.initialize && activeGlobals) {
      log.log(`[Headless] Initializing provider ${requestedProvider} with globals...`)
      await provider.initialize(activeGlobals)
    }

    log.log(`[Headless] Globals keys: ${Object.keys(activeGlobals || {}).join(', ')}`)
    if (activeGlobals?.image)
      log.log(`[Headless] Source image length: ${activeGlobals.image.length}`)

    const request: ArtistryRequest = {
      prompt: params.prompt,
      negativePrompt: params.options?.negativePrompt,
      width: typeof params.options?.width === 'number' ? params.options.width : undefined,
      height: typeof params.options?.height === 'number' ? params.options.height : undefined,
      model: params.model,
      extra: {
        ...params.options,
        image: activeGlobals?.image,
        internalJobId: createRunId('headless'),
      },
    }

    log.log(`[Headless] Starting generation with provider: ${requestedProvider}, model: ${params.model || 'default'}`)
    const job = await provider.generate(request)
    log.log(`[Headless] Job created: ${job.jobId}`)

    // Polling/Wait for result
    if (!supportsJobCallback(provider)) {
      let isDone = false
      let lastStatus = await provider.getStatus(job.jobId)
      const start = Date.now()
      const timeout = 1000 * 60 * 5 // 5 minutes timeout

      while (!isDone) {
        if (Date.now() - start > timeout) {
          log.error(`[Headless] Job ${job.jobId} timed out after 5 minutes.`)
          throw new Error('Image generation timed out after 5 minutes.')
        }

        log.log(`[Headless] Polling status for job: ${job.jobId}...`)
        lastStatus = await provider.getStatus(job.jobId)
        log.log(`[Headless] Status for job ${job.jobId}: ${lastStatus.status}`)

        if (lastStatus.status === 'succeeded' || lastStatus.status === 'failed') {
          isDone = true
        }
        if (!isDone) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }

      if (lastStatus.status === 'failed') {
        log.error(`[Headless] Job ${job.jobId} failed: ${lastStatus.error || 'Unknown error'}`)
        throw new Error(lastStatus.error || 'Generation failed')
      }

      log.log(`[Headless] Job ${job.jobId} succeeded. Image URL: ${lastStatus.imageUrl}`)
      const base64 = lastStatus.imageUrl ? await downloadImageAsBase64(lastStatus.imageUrl) : undefined
      return { imageUrl: lastStatus.imageUrl, base64 }
    }
    else {
      // For providers with callbacks (like ComfyUI), we wait for the result via the callback
      log.log(`[Headless] Using callback-based wait logic for provider: ${requestedProvider}`)
      return new Promise<{ imageUrl?: string, base64?: string }>((resolve, reject) => {
        const timeout = 1000 * 60 * 5 // 5 minutes timeout
        const timer = setTimeout(() => {
          reject(new Error('Image generation timed out after 5 minutes.'))
        }, timeout)

        provider.setJobCallback(request.extra?.internalJobId as string, async (status) => {
          if (status.status === 'succeeded') {
            clearTimeout(timer)
            try {
              const base64 = status.imageUrl ? await downloadImageAsBase64(status.imageUrl) : undefined
              resolve({ imageUrl: status.imageUrl, base64 })
            }
            catch (e) {
              reject(e)
            }
          }
          else if (status.status === 'failed') {
            clearTimeout(timer)
            reject(new Error(status.error || 'Generation failed'))
          }
        })
      })
    }
  })()

  pendingHeadlessRequests.set(fingerprint, executionPromise)

  try {
    return await executionPromise
  }
  catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
  finally {
    // Remove from map after completion so it can be re-triggered later
    pendingHeadlessRequests.delete(fingerprint)
  }
}

async function handleArtistryTrigger(params: {
  id: string
  componentName?: string
  componentProps?: unknown
  widgetsManager: WidgetsWindowManager
}) {
  if (params.componentName !== 'comfy' && params.componentName !== 'artistry')
    return

  log.log(`🔍 Intercepted widget update [${params.id}] for component: ${params.componentName}`)

  const props = robustParse(params.componentProps, 'componentProps')
  const payload = robustParse(props.payload, 'payload')
  const artistryConfigOverrides = robustParse(props._artistryConfig, '_artistryConfig')
  const status = props.status
  const prompt = (payload.prompt || props.prompt) as string | undefined

  // Build configuration with fallbacks:
  // 1. Explicitly provided in component props (_artistryConfig)
  // 2. Character-level defaults synced from renderer (cardDefaults)
  const config: TriggerConfig = {
    provider: artistryConfigOverrides.provider as string | undefined,
    model: (artistryConfigOverrides.model as string | undefined) || cardDefaults.model,
    promptPrefix: (artistryConfigOverrides.promptPrefix as string | undefined) || cardDefaults.promptPrefix,
    options: {
      ...cardDefaults.options,
      ...robustParse(artistryConfigOverrides.options, 'artistryOptions'),
    },
    // NOTICE: Keep legacy `Globals` fallback while standardizing on `globals`.
    // Older widget payloads can still send `Globals`, and dropping it now would break them.
    globals: robustParse(artistryConfigOverrides.globals || artistryConfigOverrides.Globals || cardDefaults.globals, 'artistryGlobals'),
  }
  const { config: artistryConfig } = await injeca.resolve({ config: 'configs:artistry' } as { config: ProvidedBy<Config<typeof artistryConfigSchema>> })
  const providerId = config.provider || cardDefaults.provider || artistryConfig.get()?.artistryProvider || 'comfyui'

  // [BY DESIGN]: Short-circuit if artistry is explicitly disabled (provider: 'none').
  // This prevents noisy "Provider not found" errors when the feature is intentionally bypassed.
  if (providerId === 'none') {
    log.log(`[Artistry Bridge] Provider is 'none'. Bypassing generation for widget: ${params.id}`)
    return
  }

  // Extract options and remix ID fallback
  const options = config.options || {}
  // TODO: move remix defaults into per-card/provider config to remove this fallback heuristic.
  const remixId = (payload.remixId || props.remixId || options.remixId) as string | undefined
    || (props.status === 'generating' && !prompt ? DEFAULT_REMIX_ID : undefined)

  const mode = props.mode || (remixId ? 'remix' : 'generate')
  const triggerFingerprint = `${mode}:${remixId || ''}:${prompt || ''}`

  // [BY DESIGN]: We only trigger a new generation if the fingerprint (mode + remixId + prompt)
  // has actually changed for this specific widget instance. This denotes our stance on the matter:
  // it serves as a critical safety guard against redundant, billable API calls triggered
  // by reactive UI loops or state synchronization "storms". While this prevents retrying
  // the exact same prompt on the same widget instance without a manual modification,
  // it protects users from unexpected credit consumption in a high-frequency reactive
  // bridge environment. (Refer to Catalog Issue #31).
  if (status === 'generating' && lastTriggerMap.get(params.id) !== triggerFingerprint && (prompt || remixId)) {
    log.log(`🎯 TRIGGER DETECTED [${params.id}]: ${triggerFingerprint} | Mode: ${mode} | Provider: ${providerId}`)
    lastTriggerMap.set(params.id, triggerFingerprint)
    const runId = createRunId(params.id)
    activeRunMap.set(params.id, runId)

    const provider = artistryProviders.get(providerId)
    if (!provider) {
      log.error(`🔴 Provider '${providerId}' not found.`)
      params.widgetsManager.updateWidget({
        id: params.id,
        componentProps: { status: 'error', actionLabel: `Provider '${providerId}' not available` },
      })
      return
    }

    // Initialize the provider with global config fallback
    const activeGlobals = config.globals || artistryConfig.get()?.artistryGlobals
    if (provider.initialize && activeGlobals) {
      log.log(`[Artistry Bridge] Initializing provider ${providerId} with ${config.globals ? 'provided' : 'fallback'} globals...`)
      await provider.initialize(activeGlobals)
    }

    try {
      // Build the abstract request
      const request: ArtistryRequest = {
        prompt: config.promptPrefix ? `${config.promptPrefix} ${prompt}` : (prompt || ''),
        model: config.model,
        extra: {
          ...options,
          ...payload, // Include top-level payload fields (template, overrides)
          internalJobId: runId, // Track each generation independently, even on the same widget.
          remixId,
        },
      }

      const updateIfActive = (statusUpdate: Record<string, any>) => {
        // NOTICE: the same widget can kick off another generation before the previous one fully
        // settles. Only the most recent run is allowed to keep updating the widget state.
        if (activeRunMap.get(params.id) !== runId)
          return

        params.widgetsManager.updateWidget({
          id: params.id,
          componentProps: statusUpdate,
        })
      }

      // If the provider accepts callbacks (like ComfyUI streaming stdout)
      if (supportsJobCallback(provider)) {
        provider.setJobCallback(runId, (statusUpdate) => {
          updateIfActive(statusUpdate as Record<string, any>)
          if (statusUpdate.status === 'succeeded' || statusUpdate.status === 'failed') {
            log.log(`🎉 Job complete (via callback) for ${params.id}. Sending final status: done`)
            updateIfActive({ status: 'done', progress: 100, actionLabel: undefined })
          }
        })
      }

      const job = await provider.generate(request)

      // Polling loop for providers that don't do callbacks (like Replicate)
      if (!supportsJobCallback(provider)) {
        let isDone = false
        const startTime = Date.now()
        const timeoutLength = 1000 * 60 * 5 // 5 minutes timeout (Issue #56)

        while (!isDone) {
          // Check for timeout
          if (Date.now() - startTime > timeoutLength) {
            log.error(`[Artistry Bridge] Job ${job.jobId} timed out after 5 minutes.`)
            updateIfActive({ status: 'error', actionLabel: 'Generation timed out' })
            break
          }

          // Check if this run is still the active one for this widget.
          // If a user started a new generation, we must kill the old polling loop.
          if (activeRunMap.get(params.id) !== runId) {
            log.log(`[Artistry Bridge] Stale polling loop detected for ${params.id}. Aborting background task.`)
            break
          }

          const status = await provider.getStatus(job.jobId)
          if (status.status === 'succeeded' || status.status === 'failed') {
            isDone = true
          }

          updateIfActive(status as Record<string, any>)

          if (!isDone) {
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }

        if (isDone) {
          log.log(`🎉 Job complete (via polling) for ${params.id}. Sending final status: done`)
          updateIfActive({ status: 'done', progress: 100, actionLabel: undefined })
        }
      }
    }
    catch (error: unknown) {
      const message = errorMessageFrom(error) ?? 'Unknown generation error'
      log.error(`🔴 Generation failed: ${message}`)
      if (activeRunMap.get(params.id) === runId) {
        params.widgetsManager.updateWidget({
          id: params.id,
          componentProps: { status: 'error', actionLabel: message },
        })
      }
    }
  }
}

export async function setupArtistryBridge(params: {
  widgetsManager: WidgetsWindowManager
  context?: ReturnType<typeof createMainEventaContext>['context']
  artistryConfig: Config<typeof artistryConfigSchema>
}) {
  log.log('🚀 Initializing Artistry bridge (Spawn + Update Interceptor + Headless Handler)...')

  if (params.context) {
    defineInvokeHandler(params.context, artistryGenerateHeadless, async (payload) => {
      log.log(`[Artistry Bridge] [Headless] Received invoke for prompt: ${payload.prompt.slice(0, 50)}...`)
      return await generateHeadless(payload)
    })

    defineInvokeHandler(params.context, artistrySyncConfig, (payload) => {
      log.log(`🔄 Syncing artistry config to main. Provider: ${payload.provider}`)
      params.artistryConfig.update({
        artistryProvider: payload.provider || params.artistryConfig.get()?.artistryProvider || 'comfyui',
        artistryGlobals: payload.globals || params.artistryConfig.get()?.artistryGlobals || {
          comfyuiServerUrl: 'http://localhost:8188',
          comfyuiSavedWorkflows: [],
          comfyuiActiveWorkflow: '',
          replicateApiKey: '',
          replicateDefaultModel: 'black-forest-labs/flux-schnell',
          replicateAspectRatio: '16:9',
          replicateInferenceSteps: 4,
          nanobananaApiKey: '',
          nanobananaModel: 'gemini-3.1-flash-image-preview',
          nanobananaResolution: '1K',
        },
      })

      // Update character-level defaults (volatile only)
      cardDefaults.provider = payload.provider
      cardDefaults.model = payload.model
      cardDefaults.promptPrefix = payload.promptPrefix
      cardDefaults.options = payload.options
      cardDefaults.globals = payload.globals
    })

    defineInvokeHandler(params.context, artistryTestComfyUIConnection, async (payload) => {
      log.log(`🔌 Testing ComfyUI connection at: ${payload.url}`)
      try {
        const url = payload.url.replace(/\/+$/, '')
        const controller = new AbortController()
        const id = setTimeout(() => controller.abort(), 10000)
        const resp = await fetch(`${url}/system_stats`, { signal: controller.signal })
        clearTimeout(id)

        if (!resp.ok)
          throw new Error(`HTTP ${resp.status}`)
        const data = await resp.json() as { devices?: Array<{ name?: string, vram_total?: number }> }
        const gpus = data.devices?.map(d => d.name).join(', ') || 'Unknown GPU'
        const vram = data.devices?.[0]?.vram_total
        const vramStr = vram ? `${(vram / 1024 / 1024 / 1024).toFixed(1)} GB` : ''
        return {
          ok: true,
          info: `Connected — ${gpus}${vramStr ? ` (${vramStr} VRAM)` : ''}`,
        }
      }
      catch (e: unknown) {
        const message = errorMessageFrom(e) ?? 'Unknown connection error'
        log.error(`🔌 ComfyUI connection test failed: ${message}`)
        return {
          ok: false,
          info: `Failed: ${message}`,
        }
      }
    })
  }

  const originalUpdateWidget = params.widgetsManager.updateWidget
  params.widgetsManager.updateWidget = async (payload) => {
    const snapshot = params.widgetsManager.getWidgetSnapshot(payload.id)
    await originalUpdateWidget.call(params.widgetsManager, payload)
    await handleArtistryTrigger({
      id: payload.id,
      componentName: snapshot?.componentName,
      componentProps: payload.componentProps,
      widgetsManager: params.widgetsManager,
    })
  }

  const originalPushWidget = params.widgetsManager.pushWidget
  params.widgetsManager.pushWidget = async (payload) => {
    if (payload.componentName === 'comfy' || payload.componentName === 'artistry') {
      log.log(`🖼️  Enabling 'Living Wall' mode for ${payload.id}. Forcing infinite TTL. (Component: ${payload.componentName})`)
      payload.ttlMs = 0
    }

    const resultId = await originalPushWidget.call(params.widgetsManager, payload)

    await handleArtistryTrigger({
      id: resultId,
      componentName: payload.componentName,
      componentProps: payload.componentProps,
      widgetsManager: params.widgetsManager,
    })

    return resultId
  }
}
