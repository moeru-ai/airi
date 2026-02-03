import type { Action } from '../../libs/mineflayer/action'
import type { ActionInstruction } from '../action/types'

import { inspect } from 'node:util'
import vm from 'node:vm'

interface JavaScriptPlannerOptions {
  timeoutMs?: number
  maxActionsPerTurn?: number
}

interface ActionIntent {
  index: number
  params: Record<string, unknown>
  tool: string
}

interface ActivePlannerRun {
  actions: ActionInstruction[]
  actionsByName: Map<string, Action>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

  public evaluate(content: string, availableActions: Action[]): ActionInstruction[] {
    const script = extractJavaScriptCandidate(content)
    const run: ActivePlannerRun = {
      actions: [],
      actionsByName: new Map(availableActions.map(action => [action.name, action])),
    }

    this.activeRun = run
    this.installActionTools(availableActions)

    try {
      const result = new vm.Script(script).runInContext(this.context, { timeout: this.timeoutMs })
      if (typeof result !== 'undefined' && run.actions.length === 0) {
        // Keep this visible in traces for debugging, without affecting behavior.
        this.sandbox.__lastEvalResult = inspect(result, { depth: 2, breakLength: 100 })
      }
    }
    finally {
      this.activeRun = null
    }

    if (run.actions.length === 0)
      return [{ tool: 'skip', params: {} }]

    const containsSkip = run.actions.some(action => action.tool === 'skip')
    if (containsSkip && run.actions.length > 1) {
      throw new Error('skip() cannot be mixed with other tool calls in the same script')
    }

    return run.actions
  }

  private installBuiltins(): void {
    this.defineGlobalTool('skip', () => this.enqueueAction('skip', {}))
    this.defineGlobalTool('use', (toolName: unknown, params?: unknown) => {
      if (typeof toolName !== 'string' || toolName.length === 0) {
        throw new Error('use(toolName, params) requires a non-empty string toolName')
      }

      const mappedParams = isRecord(params) ? params : {}
      return this.enqueueAction(toolName, mappedParams)
    })
  }

  private installActionTools(availableActions: Action[]): void {
    for (const action of availableActions) {
      this.defineGlobalTool(action.name, (...args: unknown[]) => {
        const params = this.mapArgsToParams(action, args)
        return this.enqueueAction(action.name, params)
      })
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

  private enqueueAction(tool: string, params: Record<string, unknown>): ActionIntent {
    if (!this.activeRun) {
      throw new Error('Tool calls are only allowed during planner evaluation')
    }

    if (this.activeRun.actions.length >= this.maxActionsPerTurn) {
      throw new Error(`Action limit exceeded: max ${this.maxActionsPerTurn} actions per turn`)
    }

    if (tool !== 'skip') {
      const action = this.activeRun.actionsByName.get(tool)
      if (!action)
        throw new Error(`Unknown tool: ${tool}`)

      const parsed = action.schema.parse(params)
      this.activeRun.actions.push({
        tool,
        params: parsed,
      })
    }
    else {
      this.activeRun.actions.push({ tool: 'skip', params: {} })
    }

    const intent: ActionIntent = {
      index: this.activeRun.actions.length - 1,
      tool,
      params,
    }
    return Object.freeze(intent)
  }

  private defineGlobalTool(name: string, fn: (...args: unknown[]) => unknown): void {
    if (Object.prototype.hasOwnProperty.call(this.sandbox, name))
      return

    Object.defineProperty(this.sandbox, name, {
      value: fn,
      configurable: false,
      enumerable: true,
      writable: false,
    })
  }
}
