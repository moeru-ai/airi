import type { WidgetsWindowManager } from '../../../windows/widgets'
import type { ArtistryProvider, ArtistryRequest } from './providers/base'

import { useLogg } from '@guiiai/logg'
import { ComfyUIProvider } from './providers/comfyui'
import { ReplicateProvider } from './providers/replicate'

const log = useLogg('artistry-bridge').useGlobalConfig()

function robustParse(input: any): any {
  if (typeof input === 'object' && input !== null)
    return input
  if (typeof input === 'string') {
    try {
      return JSON.parse(input)
    }
    catch {
      return {}
    }
  }
  return {}
}

const lastTriggerMap = new Map<string, string>()

// Maintain a registry of providers
const providers = new Map<string, ArtistryProvider>()
providers.set('comfyui', new ComfyUIProvider())
providers.set('replicate', new ReplicateProvider())

async function handleArtistryTrigger(params: {
  id: string
  componentName?: string
  componentProps?: any
  widgetsManager: WidgetsWindowManager
}) {
  if (params.componentName !== 'comfy' && params.componentName !== 'artistry')
    return

  log.log(`🔍 Intercepted widget update [${params.id}] for component: ${params.componentName}`)

  const props = robustParse(params.componentProps)
  const status = props.status
  const prompt = props.payload?.prompt || props.prompt
  
  const config = props._artistryConfig || {}
  const providerId = config.provider || 'comfyui'
  
  // Extract options and remix ID fallback
  const options = config.options || {}
  const remixId = props.payload?.remixId || props.remixId || options.remixId || (props.status === 'generating' && !prompt ? '48250602' : undefined)
  
  const mode = props.mode || (remixId ? 'remix' : 'generate')
  const triggerFingerprint = `${mode}:${remixId || ''}:${prompt || ''}`

  if (status === 'generating' && lastTriggerMap.get(params.id) !== triggerFingerprint && (prompt || remixId)) {
    log.log(`🎯 TRIGGER DETECTED [${params.id}]: ${triggerFingerprint} | Mode: ${mode} | Provider: ${providerId}`)
    lastTriggerMap.set(params.id, triggerFingerprint)

    const provider = providers.get(providerId)
    if (!provider) {
      log.error(`🔴 Provider '${providerId}' not found.`)
      params.widgetsManager.updateWidget({
        id: params.id,
        componentProps: { status: 'error', actionLabel: `Provider '${providerId}' not available` },
      })
      return
    }

    // Initialize the provider with global config
    if (provider.initialize && config.Globals) {
      await provider.initialize(config.Globals)
    }

    try {
      // Build the abstract request
      const request: ArtistryRequest = {
        prompt: config.promptPrefix ? `${config.promptPrefix} ${prompt}` : prompt,
        model: config.model,
        extra: {
          ...options,
          internalJobId: params.id, // For tracking
          remixId,
        }
      }

      // If the provider accepts callbacks (like ComfyUI streaming stdout)
      if ('setJobCallback' in provider) {
        ;(provider as any).setJobCallback(params.id, (statusUpdate: any) => {
          params.widgetsManager.updateWidget({
            id: params.id,
            componentProps: statusUpdate,
          })
        })
      }

      const job = await provider.generate(request)

      // Polling loop for providers that don't do callbacks (like Replicate)
      if (!('setJobCallback' in provider)) {
        let isDone = false
        while (!isDone) {
          const status = await provider.getStatus(job.jobId)
          if (status.status === 'succeeded' || status.status === 'failed') {
            isDone = true
          }
          
          params.widgetsManager.updateWidget({
            id: params.id,
            componentProps: status,
          })

          if (!isDone) {
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
      }

      log.log(`🎉 Job complete for ${params.id}. Sending final status: done`)
      params.widgetsManager.updateWidget({
        id: params.id,
        componentProps: { status: 'done', progress: 100 },
      })

    } catch (error: any) {
      log.error(`🔴 Generation failed: ${error.message}`)
      params.widgetsManager.updateWidget({
        id: params.id,
        componentProps: { status: 'error', actionLabel: error.message },
      })
    }
  }
}

export function setupArtistryBridge(params: { widgetsManager: WidgetsWindowManager }) {
  log.log('🚀 Initializing Artistry bridge (Spawn + Update Interceptor)...')

  const originalUpdateWidget = params.widgetsManager.updateWidget
  params.widgetsManager.updateWidget = async (payload) => {
    const snapshot = params.widgetsManager.getWidgetSnapshot(payload.id)
    await handleArtistryTrigger({
      id: payload.id,
      componentName: snapshot?.componentName,
      componentProps: payload.componentProps,
      widgetsManager: params.widgetsManager,
    })
    return originalUpdateWidget.call(params.widgetsManager, payload)
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
