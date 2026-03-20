import type { ArtistryJob, ArtistryJobStatus, ArtistryProvider, ArtistryRequest } from './base'

import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'

import { useLogg } from '@guiiai/logg'

const log = useLogg('comfyui-provider').useGlobalConfig()
const LOG_FILE = 'C:\\Users\\h4rdc\\cuipp.log'

function debugLog(message: string) {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${message}\n`
  log.log(message)
  try {
    appendFileSync(LOG_FILE, line)
  }
  catch (e) {
    // fallback if file is locked
  }
}

export class ComfyUIProvider implements ArtistryProvider {
  readonly id = 'comfyui'
  readonly name = 'ComfyUI (Local)'

  private backendPath = '/mnt/e/CUIPP/comfyGalleryAppBackend'
  private nodePath = '/home/dasilva333/.nvm/versions/node/v22.22.0/bin/node'
  private hostUrl = 'https://comfyui-plus.duckdns.org'
  private defaultCheckpoint = 'bunnyMint_bunnyMint.safetensors'

  // We maintain an active callback for stdout progress tracking since ComfyUI streams it
  private jobCallbacks = new Map<string, (status: ArtistryJobStatus) => void>()

  async initialize(config: any): Promise<void> {
    if (config?.comfyuiWslBackendPath)
      this.backendPath = config.comfyuiWslBackendPath
    if (config?.comfyuiWslNodePath)
      this.nodePath = config.comfyuiWslNodePath
    if (config?.comfyuiHostUrl)
      this.hostUrl = config.comfyuiHostUrl
    if (config?.comfyuiDefaultCheckpoint)
      this.defaultCheckpoint = config.comfyuiDefaultCheckpoint
  }

  // ComfyUI pushes status updates through stdout, so we accept a continuous callback stream
  setJobCallback(jobId: string, callback: (status: ArtistryJobStatus) => void) {
    this.jobCallbacks.set(jobId, callback)
  }

  async generate(request: ArtistryRequest): Promise<ArtistryJob> {
    const targetId = request.extra?.remixId
    const isRemix = !!targetId
    const checkpoint = request.model || request.extra?.checkpoint || this.defaultCheckpoint

    const args = [
      'wsl',
      this.nodePath,
      `${this.backendPath}/cli-agent.js`,
      isRemix ? 'remix' : 'generate',
    ]

    if (request.prompt) {
      args.push(isRemix ? '--prompt' : request.prompt)
      if (isRemix)
        args.push(request.prompt)
    }

    if (targetId) {
      args.push('--targetId', String(targetId))
    }

    if (isRemix) {
      args.push('--overrides', JSON.stringify({ checkpoint, batch_size: 1 }))
    }
    else {
      args.push('-c', checkpoint, '-b', '1')
    }

    debugLog(`[CLI SPAWN] ${args.join(' ')}`)

    // We use the request's internal ID as our Job ID
    const jobId = request.extra?.internalJobId || Math.random().toString(36).slice(2)
    const activeCallback = this.jobCallbacks.get(jobId)

    const child = spawn(args[0], args.slice(1), { cwd: 'E:\\CUIPP\\comfyGalleryAppBackend' })
    let lastProgress = 0

    child.stdout.on('data', (data) => {
      const output = data.toString()
      debugLog(`[CLI STDOUT] ${output}`)

      if (!activeCallback)
        return

      const progressMatch = output.match(/(\d+)%/)
      if (progressMatch) {
        const progress = Number.parseInt(progressMatch[1])
        if (progress !== lastProgress) {
          lastProgress = progress
          activeCallback({ progress, status: 'running' })
        }
      }

      const labelMatch = output.match(/(?:▶️|🕒|✅)\s+([A-Z\-_ ]+?)\s+\d*%?/i)
      if (labelMatch) {
        activeCallback({ status: 'running', actionLabel: labelMatch[1].trim() })
      }

      const fileMatches = output.matchAll(/File: (.*\.webp|.*\.png|.*\.jpg)/g)
      for (const match of fileMatches) {
        const fullPath = match[1].trim()
        const filename = fullPath.split('/').pop() || fullPath.split('\\').pop()
        const imageUrl = `${this.hostUrl}/${filename}`

        debugLog(`[CLI IMAGE FIND] ${imageUrl}`)
        activeCallback({ status: 'succeeded', progress: 100, imageUrl })
      }
    })

    child.stderr.on('data', (data) => {
      debugLog(`[CLI STDERR] ${data.toString()}`)
    })

    child.on('close', (code) => {
      debugLog(`[CLI CLOSE] Process exited with code ${code}`)
      if (code !== 0 && activeCallback) {
        activeCallback({
          status: 'failed',
          error: `CLI Error (${code}). Ensure ComfyUI network app is running.`,
        })
      }
    })

    return { jobId, providerJobId: String(child.pid) }
  }

  // Not strictly used for ComfyUI since it pushes updates via callbacks
  async getStatus(_jobId: string): Promise<ArtistryJobStatus> {
    return { status: 'running' }
  }
}
