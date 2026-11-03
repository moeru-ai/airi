import type { AuvDaemon } from '@auv-js/sdk/node'

import type { ComputerUseResult } from '../../../../shared/eventa/computer-use'
import type { PendingActionManager } from './action-manager'
import type { InvocationAttribution } from './attribution'
import type { AuvCommandClassification } from './classifier'

import process from 'node:process'

import { execFile } from 'node:child_process'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import { promisify } from 'node:util'

import { startAuv } from '@auv-js/sdk/node'
import { fileTypeFromBuffer } from 'file-type'

import * as v from 'valibot'

import { isComputerUseHelpCall } from '../../../../shared/eventa/computer-use'
import { validateAttribution } from './attribution'
import { classifyAuvCommand } from './classifier'

const execFileAsync = promisify(execFile)
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const attributionSchema = v.object({
  sessionId: v.pipe(v.string(), v.minLength(1), v.check(value => !value.includes('\0'))),
  turnId: v.optional(v.string()),
  toolCallId: v.optional(v.string()),
})

const inputSchema = v.object({
  argv: v.pipe(
    v.array(v.pipe(v.string(), v.maxLength(16384), v.check(value => !value.includes('\0')))),
    v.minLength(2),
    v.maxLength(128),
  ),
  actionId: v.optional(v.string()),
  attribution: v.optional(attributionSchema),
})

const readImageSchema = v.object({
  path: v.string(),
  attribution: v.optional(attributionSchema),
})

export interface ComputerUseRuntimeOptions {
  binaryPath: string
  storeRoot: string
  /** Main-owned PendingAction store enforcing single-use approval consumption */
  actionManager?: PendingActionManager
  /**
   * Whether session attribution is required for real desktop commands.
   * Defaults to true (Fail-Closed).
   */
  requireAttribution?: boolean
  /**
   * Fallback authorization hook when actionManager is not supplied.
   */
  authorizeMutation?: (context: {
    argv: readonly string[]
    classification: AuvCommandClassification
    attribution?: InvocationAttribution
    actionId?: string
  }) => boolean
}

/** Owns one private daemon and serializes desktop operations across renderer windows. */
export function createComputerUseRuntime(options: ComputerUseRuntimeOptions) {
  let daemon: AuvDaemon | undefined
  let disposed = false
  let queue: Promise<unknown> = Promise.resolve()
  const abort = new AbortController()

  async function connect() {
    if (daemon)
      return daemon

    // The SDK creates a private socket or pipe and requires its launcher token from every local caller.
    const started = await startAuv({
      binaryPath: options.binaryPath,
      storeRoot: options.storeRoot,
      noRegister: true,
      signal: abort.signal,
    })
    daemon = started
    void started.exited.then(() => {
      if (daemon === started)
        daemon = undefined
    })
    return started
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(() => {
      if (disposed)
        throw new Error('Computer use has stopped.')
      return operation()
    })
    // A failed command must not prevent later commands from running.
    queue = next.then(() => undefined, () => undefined)
    return next
  }

  async function run(input: unknown, callerWebContentsId?: number): Promise<ComputerUseResult> {
    const parsed = v.parse(inputSchema, input)

    // 1. Immutable snapshot to eliminate TOCTOU across queueing and asynchronous execution.
    const validatedArgv = Object.freeze([...parsed.argv])

    // 2. The host owns routing and artifact storage. CLI global flags must not replace them.
    const managedFlags = [
      '--credential-stdin',
      '--store-root',
      '--endpoint',
      '--device',
      '--device-id',
      '--run',
      '--config',
      '--profile',
      '--discovery-file',
      '--pairing-store',
    ]
    if (validatedArgv.some(arg => managedFlags.some(flag => arg === flag || arg.startsWith(`${flag}=`))))
      throw new Error('Computer use routing and storage are managed by AIRI.')

    // 3. Host Enforcement Gate: evaluate command classification on the frozen argv.
    const classification = classifyAuvCommand(validatedArgv)

    if (classification.category === 'unknown') {
      throw new Error(`Use invoke with a desktop command or --help. (${classification.reason})`)
    }

    // 4. Trusted Invocation Attribution (Fail-Closed when enabled)
    let attribution: InvocationAttribution | undefined
    if (parsed.attribution) {
      attribution = validateAttribution(parsed.attribution, callerWebContentsId)
    }
    else if (!classification.isHelp && options.requireAttribution === true) {
      throw new Error('Invocation attribution is required (missing sessionId).')
    }

    // 5. Host Authorization & PendingAction enforcement for mutating commands
    if (classification.category === 'mutating') {
      if (options.actionManager) {
        if (!parsed.actionId) {
          throw new Error(
            `Mutating desktop operation '${classification.command ?? 'unknown'}' requires an approved action (actionId missing).`,
          )
        }
        if (!attribution) {
          throw new Error('Invocation attribution is required (missing sessionId).')
        }
        // Atomically consumes the approved action, validating parameter match, attribution match,
        // and execution preconditions (rejecting unbound mutations).
        options.actionManager.consume(parsed.actionId, {
          argv: validatedArgv,
          attribution,
        })
      }
      else {
        const isAuthorized = options.authorizeMutation?.({
          argv: validatedArgv,
          classification,
          attribution,
          actionId: parsed.actionId,
        }) ?? false

        if (!isAuthorized) {
          throw new Error(`Mutating desktop operation '${classification.command ?? 'unknown'}' is not authorized on this host.`)
        }
      }
    }

    // 6. Authorized or read-only execution: enters queue and runs via AUV daemon.
    return enqueue(async () => {
      const active = await connect()
      const command = [...validatedArgv]
      if (!command.includes('--json') && !isComputerUseHelpCall(command))
        command.push('--json')
      command.push('--store-root', options.storeRoot)
      let stdout: string
      let stderr: string
      let exitCode = 0
      const credential = active.connectionOptions.credential
      if (!credential)
        throw new Error('AUV did not issue a launcher token.')
      try {
        // Send the launcher token on stdin. Other processes of the same user can read argv and the environment.
        const pending = execFileAsync(options.binaryPath, ['--credential-stdin', ...command], {
          // connectionOptions.endpoint is a bare socket path. The CLI needs the URI form from endpoints.
          env: { ...process.env, AUV_ENDPOINT: active.endpoints[0], AUV_CONTEXT: undefined },
          encoding: 'utf8',
          timeout: 120000,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true,
          signal: abort.signal,
        })
        // A CLI that exits before it reads stdin must not raise EPIPE as an unhandled error.
        pending.child.stdin?.on('error', () => {})
        pending.child.stdin?.end(`${credential}\n`)
        ;({ stdout, stderr } = await pending)
      }
      catch (error) {
        // Nonzero exits carry AUV's failure_details. Spawn failures and timeouts throw.
        if (!(error instanceof Error) || !('code' in error) || typeof error.code !== 'number'
          || ('killed' in error && error.killed) || !('stdout' in error) || typeof error.stdout !== 'string'
          || !('stderr' in error) || typeof error.stderr !== 'string') {
          throw error
        }
        exitCode = error.code
        stdout = error.stdout
        stderr = error.stderr
      }

      // Settle action in actionManager if an actionId was consumed
      if (parsed.actionId && options.actionManager) {
        options.actionManager.settle(parsed.actionId, {
          outcome: exitCode === 0 ? 'success' : 'failed',
          exitCode,
          error: exitCode === 0 ? undefined : stderr,
        })
      }

      let output: unknown = stdout.trim()
      try {
        output = JSON.parse(stdout)
      }
      catch {
        // Help output is text. Keep it intact for command discovery.
      }
      return { argv: [...validatedArgv], exitCode, output, stderr }
    })
  }

  async function readImage(input: unknown, callerWebContentsId?: number): Promise<string> {
    const { path, attribution: rawAttribution } = v.parse(readImageSchema, input)

    if (rawAttribution) {
      validateAttribution(rawAttribution, callerWebContentsId)
    }
    else if (options.requireAttribution === true) {
      throw new Error('Invocation attribution is required (missing sessionId).')
    }

    return enqueue(async () => {
      const root = await realpath(options.storeRoot)
      const target = await realpath(path)
      const within = relative(root, target)
      if (!within || isAbsolute(within) || within === '..' || within.startsWith(`..${sep}`))
        throw new Error('Only screenshots from this AIRI computer-use store can be read.')
      const info = await stat(target)
      if (!info.isFile() || info.size > MAX_IMAGE_BYTES)
        throw new Error('Screenshot must be a file smaller than 8 MiB.')
      const data = await readFile(target)
      const type = await fileTypeFromBuffer(data)
      if (type?.mime === 'image/png' || type?.mime === 'image/jpeg')
        return `data:${type.mime};base64,${data.toString('base64')}`
      if (type?.mime !== 'image/webp')
        throw new Error('Screenshot must be PNG, JPEG, or WebP.')

      // AUV's Windows backend writes WebP. Convert it to PNG for providers that require PNG or JPEG.
      // Only that backend needs the native codec, so load it on first use, not at app start.
      const { Transformer } = await import('@napi-rs/image')
      const converted = await new Transformer(data).png(null, abort.signal)
      if (converted.length > MAX_IMAGE_BYTES)
        throw new Error('Screenshot must be smaller than 8 MiB after converting from WebP to PNG.')
      return `data:image/png;base64,${converted.toString('base64')}`
    })
  }

  /** Rejects queued calls, aborts active work, and waits for the owned daemon to exit. */
  async function dispose() {
    disposed = true
    abort.abort()
    options.actionManager?.invalidateAll()
    await queue
    await daemon?.stop()
  }

  return { run, readImage, dispose }
}
