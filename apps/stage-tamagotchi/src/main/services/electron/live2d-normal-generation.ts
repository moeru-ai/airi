import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import type { NormalInferenceResult } from '../../../shared/live2d-normal-generation'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { app } from 'electron'

import marigoldScript from '../../../../scripts/lighting/marigold.py?raw'

import { normalInference, normalInferenceStatus } from '../../../shared/live2d-normal-generation'
import { getElectronMainDirname } from '../../libs/electron/location'

// The GPU job is process-wide, including requests from different devtool windows.
let running = false

/** Registers an explicit, offline inference command for this window's lifetime. */
export function setupNormalGeneration(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  const root = resolve(getElectronMainDirname(), '../../../..')
  const experiment = resolve(root, 'docs/research/live2d-lighting-experiment')
  const python = process.env.AIRI_NORMAL_PYTHON ?? (app.isPackaged ? undefined : resolve(experiment, '.venv/bin/python'))
  const weights = process.env.AIRI_NORMAL_WEIGHTS ?? (app.isPackaged ? undefined : resolve(experiment, '.models'))
  async function availability() {
    if (!python || !weights)
      return { available: false, reason: 'The local Marigold runtime is not configured.' }
    try {
      await Promise.all([access(python), access(resolve(weights, 'models--prs-eth--marigold-normals-v1-1'))])
      return { available: true }
    }
    catch {
      return { available: false, reason: 'The local Python runtime or cached Marigold weights are missing.' }
    }
  }
  const stops = [
    defineInvokeHandler(params.context, normalInferenceStatus, availability),
    defineInvokeHandler(params.context, normalInference, async ({ png }, options) => {
      const status = await availability()
      if (!status.available || !python || !weights)
        throw new Error(status.reason)
      if (running)
        throw new Error('Another local normal generation job is running.')
      if (!png.startsWith('data:image/png;base64,') || png.length > 16_000_000)
        throw new Error('The normal generation input is not a supported PNG capture.')
      running = true
      try {
        return await new Promise<NormalInferenceResult>((resolveResult, reject) => {
          // No shell is involved. The executable and script are host-owned;
          // only the captured PNG travels through stdin. Nothing is uploaded.
          const child = spawn(python, ['-c', marigoldScript], {
            env: { ...process.env, AIRI_NORMAL_WEIGHTS: weights, HF_HUB_OFFLINE: '1', PYTHONUNBUFFERED: '1' },
            stdio: ['pipe', 'pipe', 'pipe'],
          })
          let stdout = ''
          let stderr = ''
          let failure: Error | undefined
          const stop = () => {
            failure = new Error('Normal generation was cancelled.')
            child.kill('SIGKILL')
          }
          const timer = setTimeout(() => {
            failure = new Error('Local normal generation exceeded three minutes.')
            child.kill('SIGKILL')
          }, 180_000)
          const signal = options?.abortController?.signal
          signal?.addEventListener('abort', stop, { once: true })
          params.window.once('closed', stop)
          child.stdout.on('data', (data) => {
            stdout += data.toString()
            if (stdout.length > 16_000_000) {
              failure = new Error('The local normal output exceeds the size limit.')
              child.kill('SIGKILL')
            }
          })
          child.stderr.on('data', (data) => {
            stderr = (stderr + data.toString()).slice(-6000)
          })
          child.stdin.on('error', () => { /* Process error/close supplies the failure below. */ })
          child.on('error', (error) => {
            failure = error
          })
          child.on('close', (code) => {
            clearTimeout(timer)
            signal?.removeEventListener('abort', stop)
            params.window.removeListener('closed', stop)
            if (failure || code !== 0) {
              reject(failure ?? new Error(`Marigold failed: ${stderr}`))
              return
            }
            try {
              const result: NormalInferenceResult = JSON.parse(stdout)
              if (typeof result.png !== 'string' || result.model !== 'prs-eth/marigold-normals-v1-1' || !Number.isFinite(result.seconds))
                throw new Error('Marigold returned invalid result metadata.')
              resolveResult(result)
            }
            catch (error) { reject(new Error(errorMessageFrom(error) ?? 'Could not read the Marigold result.')) }
          })
          if (signal?.aborted)
            stop()
          else
            child.stdin.end(JSON.stringify({ png }))
        })
      }
      finally { running = false }
    }),
  ]
  params.window.once('closed', () => stops.forEach(stop => stop()))
}
