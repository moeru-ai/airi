import type { Action } from '../../libs/mineflayer/action'
import type { ActionInstruction } from '../action/types'
import type { BotEvent } from '../types'

import { inspect } from 'node:util'
import vm from 'node:vm'

interface JavaScriptPlannerOptions {
  timeoutMs?: number
  maxActionsPerTurn?: number
}

interface ActionRuntimeResult {
  action: ActionInstruction
  ok: boolean
  result?: unknown
  error?: string
}

interface ActivePlannerRun {
  actionCount: number
  actionsByName: Map<string, Action>
  executeAction: (action: ActionInstruction) => Promise<unknown>
  executed: ActionRuntimeResult[]
  logs: string[]
  sawSkip: boolean
}

interface ValidationResult {
  action?: ActionInstruction
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object')
    return value

  for (const key of Object.keys(value as Record<string, unknown>)) {
    const child = (value as Record<string, unknown>)[key]
    deepFreeze(child)
  }

  return Object.freeze(value)
}

function toStructuredClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export interface RuntimeGlobals {
  event: BotEvent
  snapshot: Record<string, unknown>
}

export interface JavaScriptRunResult {
  actions: ActionRuntimeResult[]
  logs: string[]
  returnValue?: string
}

export function extractJavaScriptCandidate(input: string): string {
  const trimmed = input.trim()
  const fenced = trimmed.match(/^```(?:js|javascript|ts|typescript)?\s*([\s\S]*?)\s*```$/i)
  if (fenced?.[1])
    return fenced[1].trim()

  return trimmed
}

export class JavaScriptPlanner {
  private readonly context: vm.Context
  private activeRun: ActivePlannerRun | null = null
  private readonly maxActionsPerTurn: number
  private readonly sandbox: Record<string, unknown>
  private readonly timeoutMs: number

  constructor(options: JavaScriptPlannerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 750
    this.maxActionsPerTurn = options.maxActionsPerTurn ?? 5
    this.sandbox = {}
    this.context = vm.createContext(this.sandbox)
    this.installBuiltins()
  }

  public async evaluate(
    content: string,
    availableActions: Action[],
    globals: RuntimeGlobals,
    executeAction: (action: ActionInstruction) => Promise<unknown>,
  ): Promise<JavaScriptRunResult> {
    const script = extractJavaScriptCandidate(content)
    const run: ActivePlannerRun = {
      actionCount: 0,
      actionsByName: new Map(availableActions.map(action => [action.name, action])),
      executeAction,
      executed: [],
      logs: [],
      sawSkip: false,
    }

    this.activeRun = run
    this.installActionTools(availableActions)
    this.bindRuntimeGlobals(globals, run)

    try {
      const wrapped = `(async () => {\n${script}\n})()`
      const result = await new vm.Script(wrapped).runInContext(this.context, { timeout: this.timeoutMs })

      const returnValue = typeof result === 'undefined'
        ? undefined
        : inspect(result, { depth: 2, breakLength: 100 })

      return {
        actions: run.executed,
        logs: run.logs,
        returnValue,
      }
    }
    finally {
      this.activeRun = null
    }
  }

  private installBuiltins(): void {
    this.defineGlobalTool('skip', async () => this.runAction('skip', {}))
    this.defineGlobalTool('use', (toolName: unknown, params?: unknown) => {
      if (typeof toolName !== 'string' || toolName.length === 0) {
        throw new Error('use(toolName, params) requires a non-empty string toolName')
      }

      const mappedParams = isRecord(params) ? params : {}
      return this.runAction(toolName, mappedParams)
    })
    this.defineGlobalTool('log', (...args: unknown[]) => {
      if (!this.activeRun)
        throw new Error('log() is only allowed during planner evaluation')

      const rendered = args.map(arg => inspect(arg, { depth: 4, breakLength: 120 })).join(' ')
      this.activeRun.logs.push(rendered)
      return rendered
    })
    this.defineGlobalValue('mem', {})
  }

  private installActionTools(availableActions: Action[]): void {
    for (const action of availableActions) {
      this.defineGlobalTool(action.name, async (...args: unknown[]) => {
        const params = this.mapArgsToParams(action, args)
        return this.runAction(action.name, params)
      })
    }
  }

  private bindRuntimeGlobals(globals: RuntimeGlobals, run: ActivePlannerRun): void {
    const snapshot = deepFreeze(toStructuredClone(globals.snapshot))
    const event = deepFreeze(toStructuredClone(globals.event))

    this.sandbox.prevRun = this.sandbox.lastRun ?? null
    this.sandbox.snapshot = snapshot
    this.sandbox.event = event
    this.sandbox.now = Date.now()
    this.sandbox.self = snapshot.self
    this.sandbox.environment = snapshot.environment
    this.sandbox.social = snapshot.social
    this.sandbox.threat = snapshot.threat
    this.sandbox.attention = snapshot.attention
    this.sandbox.autonomy = snapshot.autonomy
    this.sandbox.lastRun = {
      actions: run.executed,
      logs: run.logs,
    }
  }

  private mapArgsToParams(action: Action, args: unknown[]): Record<string, unknown> {
    const shape = action.schema.shape as Record<string, unknown>
    const keys = Object.keys(shape)

    if (keys.length === 0)
      return {}

    if (args.length === 1) {
      const [firstArg] = args
      if (isRecord(firstArg))
        return firstArg

      if (keys.length === 1)
        return { [keys[0]]: firstArg }
    }

    const params: Record<string, unknown> = {}
    for (const [index, key] of keys.entries()) {
      if (index >= args.length)
        break
      params[key] = args[index]
    }

    return params
  }

  private async runAction(tool: string, params: Record<string, unknown>): Promise<ActionRuntimeResult> {
    if (!this.activeRun) {
      throw new Error('Tool calls are only allowed during planner evaluation')
    }

    if (this.activeRun.sawSkip && tool !== 'skip') {
      throw new Error('skip() cannot be mixed with other tool calls in the same script')
    }

    if (this.activeRun.actionCount >= this.maxActionsPerTurn) {
      throw new Error(`Action limit exceeded: max ${this.maxActionsPerTurn} actions per turn`)
    }

    if (tool === 'skip') {
      this.activeRun.sawSkip = true
    }

    this.activeRun.actionCount++

    if (tool === 'skip') {
      const action: ActionInstruction = { tool: 'skip', params: {} }
      const runtimeResult: ActionRuntimeResult = {
        action,
        ok: true,
        result: 'Skipped turn',
      }
      this.activeRun.executed.push(runtimeResult)
      this.sandbox.lastAction = runtimeResult
      return runtimeResult
    }

    const validation = this.validateAction(tool, params)
    if (!validation.action) {
      const runtimeResult: ActionRuntimeResult = {
        action: { tool, params },
        ok: false,
        error: validation.error ?? `Invalid tool parameters for ${tool}`,
      }
      this.activeRun.executed.push(runtimeResult)
      this.sandbox.lastAction = runtimeResult
      return runtimeResult
    }
    const action = validation.action

    try {
      const result = await this.activeRun.executeAction(action)
      const runtimeResult: ActionRuntimeResult = {
        action,
        ok: true,
        result,
      }
      this.activeRun.executed.push(runtimeResult)
      this.sandbox.lastAction = runtimeResult
      return runtimeResult
    }
    catch (error) {
      const runtimeResult: ActionRuntimeResult = {
        action,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
      this.activeRun.executed.push(runtimeResult)
      this.sandbox.lastAction = runtimeResult
      return runtimeResult
    }
  }

  private validateAction(tool: string, params: Record<string, unknown>): ValidationResult {
    if (!this.activeRun)
      throw new Error('Tool calls are only allowed during planner evaluation')

    const action = this.activeRun.actionsByName.get(tool)
    if (!action)
      throw new Error(`Unknown tool: ${tool}`)

    const parsed = action.schema.safeParse(params)
    if (!parsed.success) {
      const details = parsed.error.issues.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ')
      return {
        error: `Invalid tool parameters for ${tool}: ${details}`,
      }
    }

    return { action: { tool, params: parsed.data } }
  }

  private defineGlobalTool(name: string, fn: (...args: unknown[]) => unknown): void {
    this.defineGlobalValue(name, fn)
  }

  private defineGlobalValue(name: string, value: unknown): void {
    if (Object.prototype.hasOwnProperty.call(this.sandbox, name))
      return

    Object.defineProperty(this.sandbox, name, {
      value,
      configurable: false,
      enumerable: true,
      writable: false,
    })
  }
}
