import type {
  ParentToWorkerMessage,
  SandboxWorkerRequest,
  SandboxWorkerResult,
  WorkerToParentMessage,
} from './js-planner-sandbox-protocol'

import { fork } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { errorMessageFrom } from '@moeru/std'

import {
  createWorkerError,
  serializeWorkerError,
} from './js-planner-sandbox-protocol'

const require = createRequire(import.meta.url)

const SANDBOX_WORKER_ENTRY_PATH = realpathSync(fileURLToPath(new URL('./js-planner-worker.ts', import.meta.url)))
const ISOLATED_VM_ENTRY_PATH = realpathSync(require.resolve('isolated-vm'))
const SANDBOX_SOURCE_DIRECTORY = realpathSync(dirname(SANDBOX_WORKER_ENTRY_PATH))

function ancestorPath(path: string, levels: number): string {
  let current = path
  for (let index = 0; index < levels; index++)
    current = dirname(current)
  return current
}

const PNPM_MODULE_STORE_PATH = realpathSync(ancestorPath(ISOLATED_VM_ENTRY_PATH, 4))

function cloneStructured<T>(value: T): T {
  if (typeof value === 'undefined')
    return value

  try {
    return structuredClone(value)
  }
  catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

interface SandboxRunnerOptions {
  bridgeTimeoutMs: number
  maxBridgeCalls: number
  onBridgeRequest: (method: string, args: unknown[]) => Promise<unknown>
}

export async function executeSandboxWorker(
  request: SandboxWorkerRequest,
  options: SandboxRunnerOptions,
): Promise<SandboxWorkerResult> {
  const hardTimeoutMs = Math.max(request.timeoutMs + 2_000, options.bridgeTimeoutMs + 2_000)

  return await new Promise<SandboxWorkerResult>((resolve, reject) => {
    const stderrChunks: string[] = []
    let bridgeCallCount = 0
    let hardTimeout: ReturnType<typeof setTimeout> | undefined
    let settled = false

    const child = fork(SANDBOX_WORKER_ENTRY_PATH, [ISOLATED_VM_ENTRY_PATH], {
      cwd: SANDBOX_SOURCE_DIRECTORY,
      env: {},
      execArgv: [
        '--permission',
        '--allow-addons',
        `--allow-fs-read=${SANDBOX_SOURCE_DIRECTORY}`,
        `--allow-fs-read=${PNPM_MODULE_STORE_PATH}`,
        '--disable-proto=throw',
        '--frozen-intrinsics',
        '--experimental-transform-types',
        '--no-warnings',
      ],
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    })

    const finalize = (handler: () => void) => {
      if (settled)
        return

      settled = true
      if (hardTimeout)
        clearTimeout(hardTimeout)
      child.removeAllListeners()
      child.stderr?.removeAllListeners()
      handler()
    }

    const withCapturedStderr = (message: string): string => {
      const stderr = stderrChunks.join('').trim()
      return stderr.length > 0 ? `${message}\n${stderr}` : message
    }

    const respondToBridgeRequest = async (
      message: Extract<WorkerToParentMessage, { type: 'bridge-request' }>,
    ): Promise<void> => {
      let response: ParentToWorkerMessage

      try {
        bridgeCallCount++
        if (bridgeCallCount > options.maxBridgeCalls) {
          throw new Error(`Sandbox bridge call limit exceeded: max ${options.maxBridgeCalls} per evaluation`)
        }

        const result = await Promise.race([
          options.onBridgeRequest(message.method, message.args),
          new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error(`Sandbox bridge timed out after ${options.bridgeTimeoutMs}ms for ${message.method}`)),
              options.bridgeTimeoutMs,
            )
          }),
        ])

        response = {
          type: 'bridge-response',
          requestId: message.requestId,
          ok: true,
          result: cloneStructured(result),
        }
      }
      catch (error) {
        response = {
          type: 'bridge-response',
          requestId: message.requestId,
          ok: false,
          error: serializeWorkerError(error),
        }
      }

      if (child.connected)
        child.send(response)
    }

    hardTimeout = setTimeout(() => {
      const timeoutError = createWorkerError(
        withCapturedStderr(`Sandbox worker timed out after ${hardTimeoutMs}ms`),
      )
      void child.kill('SIGKILL')
      finalize(() => reject(timeoutError))
    }, hardTimeoutMs)

    child.stderr?.on('data', chunk => stderrChunks.push(String(chunk)))

    child.on('error', (error) => {
      finalize(() => reject(createWorkerError(withCapturedStderr(errorMessageFrom(error) ?? String(error)), undefined, error)))
    })

    child.on('exit', (code, signal) => {
      if (settled)
        return

      const reason = signal
        ? `Sandbox worker exited via signal ${signal}`
        : `Sandbox worker exited with code ${code ?? 'unknown'}`

      finalize(() => reject(createWorkerError(withCapturedStderr(reason))))
    })

    child.on('message', (message: WorkerToParentMessage) => {
      if (!message || typeof message !== 'object')
        return

      if (message.type === 'ready') {
        child.send({ type: 'evaluate', payload: request } satisfies ParentToWorkerMessage)
        return
      }

      if (message.type === 'bridge-request') {
        void respondToBridgeRequest(message)
        return
      }

      if (message.type === 'result') {
        finalize(() => resolve(message.result))
        return
      }

      if (message.type === 'error') {
        finalize(() => reject(createWorkerError(withCapturedStderr(message.error.message), message.state, message.error)))
        return
      }

      if (message.type === 'catastrophic-error') {
        void child.kill('SIGKILL')
        finalize(() => reject(createWorkerError(withCapturedStderr(message.error.message), undefined, message.error)))
      }
    })
  })
}
