import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import type {
  ClickActionInput,
  ComputerUseConfig,
  DisplayInfo,
  ExecutionTarget,
  ExecutorActionResult,
  ForegroundContext,
  PermissionInfo,
  PointerTracePoint,
  PressKeysActionInput,
  ScreenshotRequest,
  ScrollActionInput,
  TypeTextActionInput,
  WaitActionInput,
} from '../types'
import type {
  RunnerActionResult,
  RunnerInitializeResult,
  RunnerMethod,
  RunnerOpenTestTargetResult,
  RunnerRequest,
  RunnerRequestParams,
  RunnerResponse,
  RunnerScreenshotResult,
} from './protocol'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'

import { errorMessageFromValue } from '../utils/error-message'

export interface CreateLocalLinuxExecutorActionResult {
  click: RunnerActionResult
  pressKeys: RunnerActionResult
  scroll: RunnerActionResult
  typeText: RunnerActionResult
  wait: RunnerActionResult
}

export interface RemoteRunnerClientOptions {
  transportFactory?: RunnerTransportFactory
}

export interface RunnerTransportCommand {
  args: string[]
  command: string
  env?: NodeJS.ProcessEnv
}

export type RunnerTransportFactory = () => RunnerTransportCommand

interface PendingRequest {
  reject: (error: Error) => void
  resolve: (value: unknown) => void
}

export class RemoteRunnerClient {
  private child?: ChildProcessWithoutNullStreams
  private readonly config: ComputerUseConfig
  private connecting?: Promise<void>
  private currentPermissions?: PermissionInfo
  private currentTarget?: ExecutionTarget
  private readonly pending = new Map<string, PendingRequest>()
  private readonly requestQueue: Promise<void> = Promise.resolve()
  private queueTail = this.requestQueue
  private taintedReason?: string
  private readonly transportFactory: RunnerTransportFactory

  constructor(config: ComputerUseConfig, options: RemoteRunnerClientOptions = {}) {
    this.config = config
    this.transportFactory = options.transportFactory || createSshRunnerTransportFactory(config)
  }

  async click(input: ClickActionInput & { pointerTrace: PointerTracePoint[] }) {
    await this.ensureConnected()
    return await this.call<RunnerActionResult>('click', input, { mutating: true })
  }

  async close() {
    if (!this.child)
      return

    try {
      await this.call('shutdown')
    }
    catch {
      // Ignore shutdown errors and kill the transport below.
    }

    this.child.kill('SIGTERM')
    this.child = undefined
    this.currentTarget = undefined
    this.currentPermissions = undefined
    this.taintedReason = undefined
  }

  async getDisplayInfo() {
    await this.ensureConnected()
    return await this.call<DisplayInfo>('getDisplayInfo')
  }

  async getExecutionTarget() {
    await this.ensureConnected()
    return await this.call<ExecutionTarget>('getExecutionTarget')
  }

  async getForegroundContext() {
    await this.ensureConnected()
    return await this.call<ForegroundContext>('getForegroundContext')
  }

  async getPermissionInfo() {
    await this.ensureConnected()
    if (!this.currentPermissions) {
      this.currentPermissions = await this.call<PermissionInfo>('getPermissionInfo')
    }
    return this.currentPermissions
  }

  async openTestTarget() {
    await this.ensureConnected()
    return await this.call<RunnerOpenTestTargetResult>('openTestTarget')
  }

  async pressKeys(input: PressKeysActionInput) {
    await this.ensureConnected()
    return await this.call<RunnerActionResult>('pressKeys', input, { mutating: true })
  }

  async scroll(input: ScrollActionInput) {
    await this.ensureConnected()
    return await this.call<RunnerActionResult>('scroll', input, { mutating: true })
  }

  async takeScreenshot(request: ScreenshotRequest) {
    await this.ensureConnected()
    const result = await this.call<RunnerScreenshotResult>('takeScreenshot', request)
    this.taintedReason = undefined
    this.currentTarget = this.applyPersistentTaint(result.executionTarget)
    return {
      ...result,
      executionTarget: this.currentTarget,
    }
  }

  async typeText(input: TypeTextActionInput) {
    await this.ensureConnected()
    return await this.call<RunnerActionResult>('typeText', input, { mutating: true })
  }

  async wait(input: WaitActionInput) {
    await this.ensureConnected()
    return await this.call<RunnerActionResult>('wait', input)
  }

  private applyPersistentTaint(target: ExecutionTarget): ExecutionTarget {
    if (!this.taintedReason || target.mode !== 'remote') {
      return {
        ...target,
        tainted: target.tainted,
      }
    }

    return {
      ...target,
      note: this.taintedReason,
      tainted: true,
    }
  }

  private async call<Result>(method: RunnerMethod, params?: RunnerRequestParams, options: {
    mutating?: boolean
  } = {}) {
    try {
      const result = await this.rawCall<Result>(method, params)
      if (method === 'getExecutionTarget') {
        this.currentTarget = this.applyPersistentTaint(result as ExecutionTarget)
        return this.currentTarget as Result
      }

      const resultWithExecutionTarget = result as { executionTarget?: ExecutionTarget }
      if (resultWithExecutionTarget.executionTarget) {
        this.currentTarget = this.applyPersistentTaint(resultWithExecutionTarget.executionTarget)
        return {
          ...(resultWithExecutionTarget as Record<string, unknown>),
          executionTarget: this.currentTarget,
        } as Result
      }

      return result
    }
    catch (error) {
      if (options.mutating) {
        this.taintedReason = errorMessageFromValue(error)
      }

      if (this.currentTarget) {
        this.currentTarget = this.applyPersistentTaint({
          ...this.currentTarget,
          note: errorMessageFromValue(error),
        })
      }
      throw error
    }
  }

  private async connect() {
    const transport = this.transportFactory()
    const child = spawn(transport.command, transport.args, {
      env: transport.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8')
      if (stderr.length > 16_384) {
        stderr = stderr.slice(-16_384)
      }
    })

    const rl = createInterface({
      crlfDelay: Infinity,
      input: child.stdout,
    })

    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed)
        return

      let response: RunnerResponse
      try {
        response = JSON.parse(trimmed) as RunnerResponse
      }
      catch {
        return
      }

      const pending = this.pending.get(response.id)
      if (!pending)
        return

      this.pending.delete(response.id)
      if (response.ok === true) {
        pending.resolve(response.result)
        return
      }

      pending.reject(new Error(response.error.message))
    })

    const markTainted = (reason: string) => {
      this.taintedReason = reason
      if (this.currentTarget) {
        this.currentTarget = this.applyPersistentTaint(this.currentTarget)
      }
    }

    const rejectPending = (error: Error) => {
      for (const pending of this.pending.values()) {
        pending.reject(error)
      }
      this.pending.clear()
    }

    child.on('error', (error) => {
      markTainted(error.message)
      rejectPending(error)
      this.child = undefined
    })

    child.on('close', (_code, signal) => {
      markTainted(`remote runner transport closed${signal ? ` (${signal})` : ''}`)
      rejectPending(new Error(stderr.trim() || 'remote runner transport closed unexpectedly'))
      this.child = undefined
    })

    this.child = child

    const initial = await this.rawCall<RunnerInitializeResult>('initialize', {
      displaySize: this.config.remoteDisplaySize,
      observationBaseUrl: this.config.remoteObservationBaseUrl,
      observationServePort: this.config.remoteObservationServePort,
      observationToken: this.config.remoteObservationToken,
      sessionTag: this.config.sessionTag,
    })
    this.currentTarget = this.applyPersistentTaint(initial.executionTarget)
    this.currentPermissions = initial.permissionInfo
  }

  private async enqueue<Result>(task: () => Promise<Result>) {
    const next = this.queueTail.then(task, task)
    this.queueTail = next.then(() => undefined, () => undefined)
    return await next
  }

  private async ensureConnected() {
    if (this.child)
      return

    if (this.connecting) {
      await this.connecting
      return
    }

    this.connecting = this.connect()
    try {
      await this.connecting
    }
    finally {
      this.connecting = undefined
    }
  }

  private async rawCall<Result>(method: RunnerMethod, params?: RunnerRequestParams): Promise<Result> {
    return await this.enqueue(async () => {
      if (!this.child) {
        throw new Error(`remote runner is not connected for ${method}`)
      }

      const request: RunnerRequest = {
        id: randomUUID(),
        method,
        params,
      }

      const result = await new Promise<Result>((resolve, reject) => {
        this.pending.set(request.id, { reject, resolve: resolve as (value: unknown) => void })
        this.child?.stdin.write(`${JSON.stringify(request)}\n`, 'utf-8', (error) => {
          if (!error)
            return

          this.pending.delete(request.id)
          reject(error)
        })
      })

      return result
    })
  }
}

export function createSshRunnerTransportFactory(config: ComputerUseConfig): RunnerTransportFactory {
  return () => ({
    args: [
      '-T',
      '-p',
      String(config.remoteSshPort),
      '-o',
      'BatchMode=yes',
      '-o',
      'ServerAliveInterval=30',
      '-o',
      'ServerAliveCountMax=3',
      buildSshTarget(config),
      'sh',
      '-lc',
      config.remoteRunnerCommand,
    ],
    command: config.binaries.ssh,
    env: process.env,
  })
}

export function toExecutorActionResult(result: RunnerActionResult): ExecutorActionResult {
  return result
}

function buildSshTarget(config: ComputerUseConfig) {
  if (!config.remoteSshHost || !config.remoteSshUser) {
    throw new Error('linux-x11 executor requires COMPUTER_USE_REMOTE_SSH_HOST and COMPUTER_USE_REMOTE_SSH_USER')
  }

  return `${config.remoteSshUser}@${config.remoteSshHost}`
}
