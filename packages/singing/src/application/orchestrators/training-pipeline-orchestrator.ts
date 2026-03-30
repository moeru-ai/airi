import process from 'node:process'

import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { resolveRuntimeEnv } from '../../adapters/runtime/env-resolver'
import { resolveVoiceModelDir } from '../../utils/path'

export interface TrainingProgress {
  pct: number
  step: number
  total: number
  name: string
  epoch?: number
  totalEpochs?: number
  lossG?: number
  lossD?: number
}

export interface TrainingPipelineOptions {
  epochs?: number
  batchSize?: number
  signal?: AbortSignal
  onProgress?: (progress: TrainingProgress) => void
}

/**
 * Orchestrates the RVC training pipeline via Python subprocess.
 *
 * Output is written to `voice_models/<voiceId>/` so that `listVoices()`
 * can discover the trained model at `<voiceId>/<voiceId>.pth`.
 *
 * Progress is reported via `progress.json` polling and stdout line parsing.
 * Supports cancellation via AbortSignal — kills the child process tree.
 */
export async function runTrainingPipeline(
  voiceId: string,
  datasetPath: string,
  options?: TrainingPipelineOptions,
): Promise<void> {
  const env = resolveRuntimeEnv()
  const voiceOutputDir = resolveVoiceModelDir(env.voiceModelsDir, voiceId)
  if (!voiceOutputDir)
    throw new Error(`Invalid voiceId for training output path: ${voiceId}`)

  await mkdir(voiceOutputDir, { recursive: true })

  if (options?.signal?.aborted) {
    throw new Error('Training aborted before start')
  }

  const args = [
    '-m',
    'airi_singing_worker.pipelines.training_pipeline',
    '--voice-id',
    voiceId,
    '--dataset',
    datasetPath,
    '--output-dir',
    voiceOutputDir,
  ]

  if (options?.epochs)
    args.push('--epochs', String(options.epochs))
  if (options?.batchSize)
    args.push('--batch-size', String(options.batchSize))

  const childEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    PYTHONPATH: env.pythonSrcDir,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
    RMVPE_MODEL_PATH: join(env.modelsDir, 'rmvpe.pt'),
    HUBERT_MODEL_PATH: join(env.modelsDir, 'hubert_base.pt'),
    RVC_PRETRAINED_G_PATH: join(env.modelsDir, 'pretrained_v2', 'f0G40k.pth'),
    RVC_PRETRAINED_D_PATH: join(env.modelsDir, 'pretrained_v2', 'f0D40k.pth'),
  }

  return new Promise((resolve, reject) => {
    const child = spawn(env.pythonPath, args, {
      env: childEnv,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let settled = false
    const stderrChunks: Buffer[] = []
    let stdoutBuffer = ''

    function killChild(): void {
      try {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], {
            windowsHide: true,
            stdio: 'ignore',
          })
        }
        else {
          child.kill('SIGTERM')
        }
      }
      catch { /* best effort */ }
    }

    if (options?.signal) {
      const onAbort = () => {
        if (!settled) {
          settled = true
          killChild()
          reject(new Error('Training cancelled'))
        }
      }
      if (options.signal.aborted) {
        killChild()
        reject(new Error('Training cancelled'))
        return
      }
      options.signal.addEventListener('abort', onAbort, { once: true })
      child.on('close', () => options.signal!.removeEventListener('abort', onAbort))
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString()
      if (options?.onProgress) {
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('{'))
            continue
          try {
            const data = JSON.parse(trimmed)
            if (data.type === 'progress') {
              options.onProgress({
                pct: data.pct ?? 0,
                step: data.step ?? 0,
                total: data.total ?? 0,
                name: data.name ?? '',
                epoch: data.epoch,
                totalEpochs: data.total_epochs,
                lossG: data.loss_g,
                lossD: data.loss_d,
              })
            }
          }
          catch { /* non-JSON stdout line, skip */ }
        }
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk)
    })

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true
        killChild()
        reject(new Error('Training timed out after 1 hour'))
      }
    }, 3_600_000)

    child.on('error', (err) => {
      clearTimeout(timeoutId)
      if (!settled) {
        settled = true
        reject(err)
      }
    })

    child.on('close', (code) => {
      clearTimeout(timeoutId)
      if (settled)
        return
      settled = true
      if (code === 0) {
        resolve()
      }
      else {
        const stderr = Buffer.concat(stderrChunks).toString('utf-8')
        reject(new Error(`Training pipeline failed (exit ${code}): ${stderr.slice(0, 1000)}`))
      }
    })

    if (options?.onProgress) {
      const progressPath = join(voiceOutputDir, 'progress.json')
      const pollInterval = setInterval(async () => {
        try {
          const raw = await readFile(progressPath, 'utf-8')
          const data = JSON.parse(raw)
          options.onProgress!({
            pct: data.pct ?? 0,
            step: data.step ?? 0,
            total: data.total ?? 0,
            name: data.name ?? '',
            epoch: data.epoch,
            totalEpochs: data.total_epochs,
            lossG: data.loss_g,
            lossD: data.loss_d,
          })
        }
        catch { /* progress.json may not exist yet */ }
      }, 3000)

      child.on('close', () => clearInterval(pollInterval))
    }
  })
}
