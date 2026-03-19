import type { WidgetsWindowManager } from '../../../windows/widgets'

import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'

import { useLogg } from '@guiiai/logg'

const log = useLogg('cuipp').useGlobalConfig()
const LOG_FILE = 'C:\\Users\\h4rdc\\cuipp.log'

function debugLog(message: string, count?: number) {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${message}${count !== undefined ? ` (Jobs: ${count})` : ''}\n`
  log.log(message)
  try {
    appendFileSync(LOG_FILE, line)
  }
  catch (e) {
    // fallback if file is locked
  }
}

const WSL_BACKEND_DIR = '/mnt/e/CUIPP/comfyGalleryAppBackend'
const WSL_NODE_PATH = '/home/dasilva333/.nvm/versions/node/v22.22.0/bin/node'

const activeJobs = new Map<string, number>()

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

async function handleComfyTrigger(params: {
  id: string
  componentName?: string
  componentProps?: any
  widgetsManager: WidgetsWindowManager
}) {
  if (params.componentName !== 'comfy')
    return

  const props = robustParse(params.componentProps)
  const status = props.status
  const prompt = props.payload?.prompt || props.prompt
  const targetId = props.payload?.remixId || props.remixId || (props.status === 'generating' && !prompt ? '754022' : undefined)
  const mode = props.mode || (targetId ? 'remix' : 'generate')

  const triggerFingerprint = `${mode}:${targetId || ''}:${prompt || ''}`

  if (status === 'generating' && lastTriggerMap.get(params.id) !== triggerFingerprint && (prompt || targetId)) {
    debugLog(`🎯 TRIGGER DETECTED [${params.id}]: ${triggerFingerprint}`)
    lastTriggerMap.set(params.id, triggerFingerprint)

    activeJobs.set(params.id, (activeJobs.get(params.id) || 0) + 1)
    debugLog(`📊 Active Job Count`, activeJobs.get(params.id))

    triggerCuippGeneration({
      id: params.id,
      mode,
      prompt,
      targetId,
      widgetsManager: params.widgetsManager,
    }).finally(() => {
      debugLog(`🎉 Job complete for ${params.id}. Sending final status: done`)
      params.widgetsManager.updateWidget({
        id: params.id,
        componentProps: { status: 'done', progress: 100, actionLabel: undefined },
      })
    })
  }
  else if (status === 'generating') {
    debugLog(`⏭️  Ignoring redundant status update for ${params.id}`)
  }
}

export function setupCuippBridge(params: { widgetsManager: WidgetsWindowManager }) {
  debugLog('🚀 Initializing bridge (Spawn + Update Interceptor)...')

  const originalUpdateWidget = params.widgetsManager.updateWidget
  params.widgetsManager.updateWidget = async (payload) => {
    const snapshot = params.widgetsManager.getWidgetSnapshot(payload.id)
    await handleComfyTrigger({
      id: payload.id,
      componentName: snapshot?.componentName,
      componentProps: payload.componentProps,
      widgetsManager: params.widgetsManager,
    })
    return originalUpdateWidget.call(params.widgetsManager, payload)
  }

  const originalPushWidget = params.widgetsManager.pushWidget
  params.widgetsManager.pushWidget = async (payload) => {
    debugLog(`📦 PUSH WIDGET intercepted: ${payload.id} (${payload.componentName})`)

    if (payload.componentName === 'comfy') {
      debugLog(`🖼️  Enabling 'Living Wall' mode for ${payload.id}. Forcing infinite TTL.`)
      payload.ttlMs = 0
    }

    const resultId = await originalPushWidget.call(params.widgetsManager, payload)

    await handleComfyTrigger({
      id: resultId,
      componentName: payload.componentName,
      componentProps: payload.componentProps,
      widgetsManager: params.widgetsManager,
    })

    return resultId
  }
}

async function triggerCuippGeneration(params: {
  id: string
  mode: string
  prompt?: string
  targetId?: string | number
  widgetsManager: WidgetsWindowManager
}) {
  const isRemix = params.mode === 'remix'
  const args = [
    'wsl',
    WSL_NODE_PATH,
    `${WSL_BACKEND_DIR}/cli-agent.js`,
    isRemix ? 'remix' : 'generate',
    ...(params.prompt ? (isRemix ? ['--prompt', params.prompt] : [params.prompt]) : []),
    ...(params.targetId ? ['--targetId', String(params.targetId)] : []),
  ]

  if (isRemix) {
    args.push('--overrides', JSON.stringify({ checkpoint: 'bunnyMint_bunnyMint.safetensors', batch_size: 1 }))
  }
  else {
    args.push('-c', 'bunnyMint_bunnyMint.safetensors', '-b', '1')
  }

  console.log(`[CUIPP] Spawning: ${args.join(' ')}`)
  debugLog(`[CLI SPAWN] ${args.join(' ')}`)

  const child = spawn(args[0], args.slice(1), { cwd: 'E:\\CUIPP\\comfyGalleryAppBackend' })
  let lastProgress = 0

  return new Promise<void>((resolve) => {
    child.stdout.on('data', (data) => {
      const output = data.toString()
      debugLog(`[CLI STDOUT] ${output}`)

      const progressMatch = output.match(/(\d+)%/)
      if (progressMatch) {
        const progress = Number.parseInt(progressMatch[1])
        if (progress !== lastProgress) {
          lastProgress = progress
          params.widgetsManager.updateWidget({
            id: params.id,
            componentProps: { progress, status: 'generating' },
          })
        }
      }

      const labelMatch = output.match(/(?:▶️|🕒|✅)\s+([A-Z\-_ ]+?)\s+\d*%?/i)
      if (labelMatch) {
        params.widgetsManager.updateWidget({
          id: params.id,
          componentProps: { actionLabel: labelMatch[1].trim() },
        })
      }

      const fileMatches = output.matchAll(/File: (.*\.webp|.*\.png|.*\.jpg)/g)
      for (const match of fileMatches) {
        const fullPath = match[1].trim()
        debugLog(`[CLI IMAGE FIND] ${fullPath}`)
        const filename = fullPath.split('/').pop() || fullPath.split('\\').pop()
        const imageUrl = `https://comfyui-plus.duckdns.org/${filename}`

        console.log(`[CUIPP] 🖼️  EXTRACTED IMAGE: ${filename}`)
        console.log(`[CUIPP] 🔗 EMITTING URL: ${imageUrl}`)

        params.widgetsManager.updateWidget({
          id: params.id,
          componentProps: { imageUrl },
        })
      }
    })

    child.stderr.on('data', (data) => {
      const errorMsg = data.toString()
      debugLog(`[CLI STDERR] ${errorMsg}`)
      console.error(`[CUIPP] 🔴 Error: ${errorMsg}`)
    })

    child.on('close', (code) => {
      debugLog(`[CLI CLOSE] Process exited with code ${code}`)
      console.log(`[CUIPP] 🔚 CLI Process exited with code ${code}`)
      if (code !== 0) {
        params.widgetsManager.updateWidget({
          id: params.id,
          componentProps: {
            status: 'error',
            actionLabel: `CLI Error (${code}). Ensure ComfyUI is running.`,
          },
        })
      }
      resolve()
    })
  })
}
