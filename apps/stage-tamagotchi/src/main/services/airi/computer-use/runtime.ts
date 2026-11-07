import type { AuvDaemon } from '@auv-js/sdk/node'

import type { ComputerUseResult, ExecutionState } from '../../../../shared/eventa/computer-use'
import type { PendingActionManager } from './action-manager'
import type { InvocationAttribution } from './attribution'

import process from 'node:process'

import { execFile } from 'node:child_process'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import { promisify } from 'node:util'

import { startAuv } from '@auv-js/sdk/node'
import { errorMessageFrom } from '@moeru/std'
import { fileTypeFromBuffer } from 'file-type'

import * as v from 'valibot'

import { ComputerUseExecutionError, extractErrorDetails, isComputerUseHelpCall } from '../../../../shared/eventa/computer-use'
import { validateAttribution } from './attribution'
import { classifyAuvCommand, MANAGED_FLAGS } from './classifier'

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
}

/** Owns one private daemon and serializes desktop operations across renderer windows. */
export function createComputerUseRuntime(options: ComputerUseRuntimeOptions) {
  let daemon: AuvDaemon | undefined
  let disposed = false
  let hasLingeringMutationRisk = false
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
    hasLingeringMutationRisk = false
    void started.exited.then(() => {
      if (daemon === started)
        daemon = undefined
    })
    return started
  }

  function enqueue<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const next = queue.then(() => {
      if (disposed)
        throw new ComputerUseExecutionError('Computer use has stopped.', { executionState: 'not_executed' })
      // Eventa owns request cancellation. Work that has not started must not outlive its Chat turn.
      signal?.throwIfAborted()
      return operation()
    })
    // A failed command must not prevent later commands from running.
    queue = next.then(() => undefined, () => undefined)
    return next
  }

  async function run(input: unknown, callerWebContentsId?: number, signal?: AbortSignal): Promise<ComputerUseResult> {
    let validatedArgv: readonly string[] = []
    let parsed: v.InferOutput<typeof inputSchema>
    let classification: ReturnType<typeof classifyAuvCommand>
    let attribution: InvocationAttribution | undefined

    try {
      parsed = v.parse(inputSchema, input)

      // Snapshot caller arguments before the queue wait.
      validatedArgv = Object.freeze([...parsed.argv])

      // 2. The host owns routing and artifact storage. CLI global flags must not replace them.
      if (validatedArgv.some(arg => MANAGED_FLAGS.some(flag => arg === flag || arg.startsWith(`${flag}=`))))
        throw new ComputerUseExecutionError('Computer use routing and storage are managed by AIRI.', { executionState: 'not_executed', argv: validatedArgv })

      // 3. Host Enforcement Gate: evaluate command classification on the frozen argv.
      classification = classifyAuvCommand(validatedArgv)

      if (classification.category === 'unknown') {
        throw new ComputerUseExecutionError(`Use invoke with a desktop command or --help. (${classification.reason})`, { executionState: 'not_executed', argv: validatedArgv })
      }

      // 4. Request correlation and the independently observed Electron source.
      if (parsed.attribution) {
        attribution = validateAttribution(parsed.attribution, callerWebContentsId)
      }
      else if (!classification.isHelp && options.requireAttribution !== false) {
        throw new ComputerUseExecutionError('Invocation attribution is required (missing sessionId).', { executionState: 'not_executed', argv: validatedArgv })
      }
      if (!classification.isHelp && options.requireAttribution !== false && (!attribution?.turnId || !attribution.toolCallId))
        throw new ComputerUseExecutionError('Invocation attribution requires the original turn ID and tool-call ID.', { executionState: 'not_executed', argv: validatedArgv })

      // 5. Host Authorization & PendingAction enforcement for mutating commands
      if (classification.category === 'mutating') {
        if (options.actionManager) {
          if (!parsed.actionId) {
            throw new ComputerUseExecutionError(
              `Mutating desktop operation '${classification.command ?? 'unknown'}' requires an approved action (actionId missing).`,
              { executionState: 'not_executed', argv: validatedArgv },
            )
          }
          if (!attribution) {
            throw new ComputerUseExecutionError('Invocation attribution is required (missing sessionId).', { executionState: 'not_executed', argv: validatedArgv })
          }
          // Reject invalid approvals before they can wait behind another operation.
          options.actionManager.validate(parsed.actionId, {
            argv: validatedArgv,
            attribution,
          })
        }
        else {
          throw new ComputerUseExecutionError(`Mutating desktop operation '${classification.command ?? 'unknown'}' is not authorized on this host.`, { executionState: 'not_executed', argv: validatedArgv })
        }
        if (hasLingeringMutationRisk) {
          throw new ComputerUseExecutionError(
            `Mutating desktop operation '${classification.command ?? 'unknown'}' is rejected: previous mutating operation ended with unconfirmed background processes. Reconnect or restart daemon before dispatching new mutations.`,
            { executionState: 'not_executed', argv: validatedArgv },
          )
        }
      }
    }
    catch (error) {
      if (error instanceof ComputerUseExecutionError)
        throw error
      throw new ComputerUseExecutionError(errorMessageFrom(error) ?? 'Computer use failed before dispatch.', {
        executionState: 'not_executed',
        argv: validatedArgv,
        cause: error,
      })
    }

    // 6. Authorized or read-only execution: enters queue and runs via AUV daemon.
    let dispatched = false
    return enqueue(async () => {
      let consumedActionId: string | undefined
      try {
        if (classification.category === 'mutating' && hasLingeringMutationRisk) {
          throw new ComputerUseExecutionError(
            `Mutating desktop operation '${classification.command ?? 'unknown'}' is rejected: previous mutating operation ended with unconfirmed background processes. Reconnect or restart daemon before dispatching new mutations.`,
            { executionState: 'not_executed', argv: validatedArgv },
          )
        }
        // Reject invalidated queued work before starting or reconnecting the daemon.
        if (classification.category === 'mutating' && options.actionManager && parsed.actionId && attribution) {
          options.actionManager.validate(parsed.actionId, { argv: validatedArgv, attribution })
        }
        const active = await connect()
        if (disposed)
          throw new ComputerUseExecutionError('Computer use has stopped.', { executionState: 'not_executed', argv: validatedArgv })
        signal?.throwIfAborted()
        const command = [...validatedArgv]
        if (!command.includes('--json') && !isComputerUseHelpCall(command))
          command.push('--json')
        command.push('--store-root', options.storeRoot)
        let stdout: string
        let stderr: string
        let exitCode = 0
        const credential = active.connectionOptions.credential
        if (!credential)
          throw new ComputerUseExecutionError('AUV did not issue a launcher token.', { executionState: 'not_executed', argv: validatedArgv })
        const environment = { ...process.env, AUV_ENDPOINT: active.endpoints[0], AUV_CONTEXT: undefined }
        // Readiness is complete. Consume and dispatch in the same synchronous turn.
        // Consumption commits Host dispatch, not proof of native execution or its effects.
        if (classification.category === 'mutating' && options.actionManager && parsed.actionId && attribution) {
          options.actionManager.consume(parsed.actionId, { argv: validatedArgv, attribution })
          consumedActionId = parsed.actionId
        }
        const args = ['--credential-stdin', ...command]
        // Merge runtime lifecycle and request-level cancellation signals
        const executionSignal = signal ? AbortSignal.any([abort.signal, signal]) : abort.signal
        dispatched = true
        // Send the launcher token on stdin. Other processes of the same user can read argv and the environment.
        const pending = execFileAsync(options.binaryPath, args, {
          // connectionOptions.endpoint is a bare socket path. The CLI needs the URI form from endpoints.
          env: environment,
          encoding: 'utf8',
          timeout: 120000,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true,
          signal: executionSignal,
        })
        const child = pending.child

        let stdioDrainedOrDestroyed = false
        let lingeringDescendants = false
        let forceKillTimer: NodeJS.Timeout | undefined
        let stdioDrainTimer: NodeJS.Timeout | undefined
        let onAbort: (() => void) | undefined

        const destroyStdio = () => {
          if (!stdioDrainedOrDestroyed) {
            stdioDrainedOrDestroyed = true
            lingeringDescendants = true
            try {
              child.stdout?.destroy()
            }
            catch {}
            try {
              child.stderr?.destroy()
            }
            catch {}
            try {
              child.stdin?.destroy()
            }
            catch {}
          }
        }

        const childClosed = new Promise<void>((resolve) => {
          if (!child || !('once' in child) || typeof child.once !== 'function' || child.exitCode !== null || child.signalCode !== null) {
            resolve()
            return
          }
          const cleanup = () => {
            if (forceKillTimer)
              clearTimeout(forceKillTimer)
            if (stdioDrainTimer)
              clearTimeout(stdioDrainTimer)
            if (executionSignal && onAbort)
              executionSignal.removeEventListener('abort', onAbort)
            resolve()
          }

          child.once('close', () => {
            stdioDrainedOrDestroyed = true
            cleanup()
          })
          child.once('error', cleanup)

          // Direct child process termination: if child exits, drain stdio with bounded window (1000ms)
          child.once('exit', () => {
            if (!stdioDrainedOrDestroyed && !stdioDrainTimer) {
              stdioDrainTimer = setTimeout(() => {
                destroyStdio()
                cleanup()
              }, 1000)
            }
          })

          onAbort = () => {
            forceKillTimer = setTimeout(() => {
              try {
                child.kill?.('SIGKILL')
              }
              catch {}
              if (!stdioDrainTimer) {
                stdioDrainTimer = setTimeout(() => {
                  destroyStdio()
                  cleanup()
                }, 1000)
              }
            }, 3000)
          }

          if (executionSignal) {
            if (executionSignal.aborted) {
              onAbort()
            }
            else {
              executionSignal.addEventListener('abort', onAbort, { once: true })
            }
          }
        })

        try {
          // A CLI that exits before it reads stdin must not raise EPIPE as an unhandled error.
          pending.child.stdin?.on('error', () => {})
          pending.child.stdin?.end(`${credential}\n`)
          ;({ stdout, stderr } = await pending)
          await childClosed
        }
        catch (error) {
          // Wait for child process to close before releasing execution lock or settling
          await childClosed

          // Check for spawn error where child process was never created
          const isSpawnFailure = (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'EACCES'))
            || (child && 'pid' in child && child.pid === undefined)

          if (isSpawnFailure) {
            throw new ComputerUseExecutionError(errorMessageFrom(error) ?? 'Failed to spawn process', {
              executionState: 'not_executed',
              argv: validatedArgv,
              cause: error,
            })
          }
          // Nonzero exits carry AUV's failure_details. Spawn failures, killed processes and timeouts throw.
          if (!(error instanceof Error) || !('code' in error) || typeof error.code !== 'number'
            || ('killed' in error && error.killed) || !('stdout' in error) || typeof error.stdout !== 'string'
            || !('stderr' in error) || typeof error.stderr !== 'string') {
            const errRecord = error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined
            if (classification.category === 'mutating')
              hasLingeringMutationRisk = true
            throw new ComputerUseExecutionError(errorMessageFrom(error) ?? 'Command execution failed', {
              executionState: 'unknown',
              argv: validatedArgv,
              exitCode: typeof errRecord?.code === 'number' ? errRecord.code : undefined,
              stderr: typeof errRecord?.stderr === 'string' ? errRecord.stderr : undefined,
              cause: error,
            })
          }
          exitCode = error.code
          stdout = error.stdout
          stderr = error.stderr
        }
        finally {
          if (forceKillTimer)
            clearTimeout(forceKillTimer)
          if (stdioDrainTimer)
            clearTimeout(stdioDrainTimer)
          if (executionSignal && onAbort)
            executionSignal.removeEventListener('abort', onAbort)
        }

        if (classification.category === 'mutating' && lingeringDescendants) {
          hasLingeringMutationRisk = true
        }

        // Settle action in actionManager if an actionId was consumed
        if (consumedActionId && options.actionManager) {
          options.actionManager.settle(consumedActionId, {
            outcome: exitCode === 0 ? 'success' : 'failed',
            executionState: 'executed',
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
        return { argv: [...validatedArgv], exitCode, output, stderr, executionState: 'executed' as const }
      }
      catch (error) {
        if (consumedActionId && options.actionManager && !options.actionManager.get(consumedActionId)?.settlement) {
          const executionState = error instanceof ComputerUseExecutionError ? error.executionState : 'unknown'
          const rawError = error instanceof ComputerUseExecutionError
            ? error.rawMessage
            : extractErrorDetails(error).rawMessage ?? errorMessageFrom(error)?.replace(/^\[executionState:\s*\w+\]\s*/, '') ?? 'Computer use execution failed.'
          options.actionManager.settle(consumedActionId, {
            outcome: 'failed',
            executionState,
            error: rawError,
            exitCode: error instanceof ComputerUseExecutionError ? error.exitCode : undefined,
          })
        }
        throw error
      }
    }, signal).catch((error: unknown) => {
      // A pre-dispatch failure must not leave a reusable approval, including an aborted queue wait.
      // Consumed work keeps its settlement. Existing cancellation and expiry retain their reason.
      if (classification.category === 'mutating' && parsed.actionId
        && options.actionManager?.get(parsed.actionId)?.status === 'approved') {
        const rawCancelReason = error instanceof ComputerUseExecutionError
          ? error.rawMessage
          : extractErrorDetails(error).rawMessage ?? errorMessageFrom(error)?.replace(/^\[executionState:\s*\w+\]\s*/, '') ?? 'Computer use failed before dispatch.'
        options.actionManager.cancel(parsed.actionId, rawCancelReason)
      }
      if (error instanceof ComputerUseExecutionError) {
        throw error
      }
      const executionState: ExecutionState = dispatched ? 'unknown' : 'not_executed'
      const fallbackMessage = dispatched ? 'Computer use execution failed.' : 'Computer use failed before dispatch.'
      throw new ComputerUseExecutionError(errorMessageFrom(error) ?? fallbackMessage, {
        executionState,
        argv: validatedArgv,
        cause: error,
      })
    })
  }

  async function readImage(input: unknown, callerWebContentsId?: number, signal?: AbortSignal): Promise<string> {
    const { path, attribution: rawAttribution } = v.parse(readImageSchema, input)

    if (rawAttribution) {
      const attribution = validateAttribution(rawAttribution, callerWebContentsId)
      if (options.requireAttribution !== false && (!attribution.turnId || !attribution.toolCallId))
        throw new Error('Invocation attribution requires the original turn ID and tool-call ID.')
    }
    else if (options.requireAttribution !== false) {
      throw new Error('Invocation attribution is required (missing sessionId).')
    }

    return readScreenshot(path, signal)
  }

  /** Reads history previews for an Electron caller under the shared local artifact policy, without fabricating a session. */
  async function previewImage(input: unknown, callerWebContentsId?: number): Promise<string> {
    if (typeof callerWebContentsId !== 'number' || !Number.isSafeInteger(callerWebContentsId) || callerWebContentsId <= 0)
      throw new Error('Screenshot previews require a verified Electron sender.')
    const { path } = v.parse(v.object({ path: v.string() }), input)
    return readScreenshot(path)
  }

  function readScreenshot(path: string, signal?: AbortSignal): Promise<string> {
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
    }, signal)
  }

  /** Rejects queued calls, aborts active work, and waits for the owned daemon to exit. */
  async function dispose() {
    disposed = true
    hasLingeringMutationRisk = false
    abort.abort()
    options.actionManager?.invalidateAll()
    await queue
    await daemon?.stop()
  }

  return { run, readImage, previewImage, dispose }
}
