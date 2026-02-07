import type { Action } from '../../libs/mineflayer/action'
import type { Mineflayer } from '../../libs/mineflayer/core'
import type { ActionInstruction } from '../action/types'
import type { BotEvent } from '../types'

import vm from 'node:vm'

import { inspect } from 'node:util'

import { createQueryRuntime } from './query-dsl'

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

function isCoord(value: unknown): value is { x: number, y: number, z: number } {
  return isRecord(value)
    && typeof value.x === 'number'
    && typeof value.y === 'number'
    && typeof value.z === 'number'
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
  mineflayer?: Mineflayer | null
  bot?: unknown
  actionQueue?: unknown
  noActionBudget?: unknown
  errorBurstGuard?: unknown
  currentInput?: unknown
  llmLog?: unknown
  setNoActionBudget?: (value: number) => { ok: true, remaining: number, default: number, max: number }
  getNoActionBudget?: () => { remaining: number, default: number, max: number }
  forgetConversation?: () => { ok: true, cleared: string[] }
  llmInput?: {
    systemPrompt: string
    userMessage: string
    messages: unknown[]
    conversationHistory: unknown[]
    updatedAt: number
    attempt: number
  } | null
}

export interface JavaScriptRunResult {
  actions: ActionRuntimeResult[]
  logs: string[]
  returnValue?: string
}

export interface PlannerGlobalDescriptor {
  name: string
  kind: 'tool' | 'function' | 'object' | 'number' | 'string' | 'boolean' | 'undefined' | 'null' | 'unknown'
  readonly: boolean
  preview: string
}

interface DescribeGlobalsOptions {
  includeBuiltins?: boolean
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
        : inspect(result, {
            depth: null,
            breakLength: 100,
            maxArrayLength: 100,
            maxStringLength: 10_000,
          })

      if (isRecord(this.sandbox.lastRun)) {
        this.sandbox.lastRun.returnValue = returnValue
        this.sandbox.lastRun.returnRaw = result
      }

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

  public canEvaluateAsExpression(content: string): boolean {
    const script = extractJavaScriptCandidate(content)
    if (!script.trim())
      return false

    try {
      void new vm.Script(`(async () => (\n${script}\n))()`)
      return true
    }
    catch {
      return false
    }
  }

  public describeGlobals(
    availableActions: Action[],
    globals: RuntimeGlobals,
    options: DescribeGlobalsOptions = {},
  ): PlannerGlobalDescriptor[] {
    const descriptors: PlannerGlobalDescriptor[] = []

    const includeBuiltins = options.includeBuiltins ?? true

    const staticGlobals: Array<Omit<PlannerGlobalDescriptor, 'preview'>> = [
      { name: 'skip', kind: 'tool', readonly: true },
      { name: 'use', kind: 'function', readonly: true },
      { name: 'log', kind: 'function', readonly: true },
      { name: 'expect', kind: 'function', readonly: true },
      { name: 'expectMoved', kind: 'function', readonly: true },
      { name: 'expectNear', kind: 'function', readonly: true },
      { name: 'snapshot', kind: 'object', readonly: true },
      { name: 'event', kind: 'object', readonly: true },
      { name: 'now', kind: 'number', readonly: true },
      { name: 'self', kind: 'object', readonly: true },
      { name: 'environment', kind: 'object', readonly: true },
      { name: 'social', kind: 'object', readonly: true },
      { name: 'threat', kind: 'object', readonly: true },
      { name: 'attention', kind: 'object', readonly: true },
      { name: 'autonomy', kind: 'object', readonly: true },
      { name: 'llmInput', kind: 'object', readonly: true },
      { name: 'currentInput', kind: 'object', readonly: true },
      { name: 'llmLog', kind: 'object', readonly: true },
      { name: 'actionQueue', kind: 'object', readonly: true },
      { name: 'noActionBudget', kind: 'object', readonly: true },
      { name: 'errorBurstGuard', kind: 'object', readonly: true },
      { name: 'setNoActionBudget', kind: 'function', readonly: true },
      { name: 'getNoActionBudget', kind: 'function', readonly: true },
      { name: 'forget_conversation', kind: 'function', readonly: true },
      { name: 'llmMessages', kind: 'object', readonly: true },
      { name: 'llmSystemPrompt', kind: 'string', readonly: true },
      { name: 'llmUserMessage', kind: 'string', readonly: true },
      { name: 'llmConversationHistory', kind: 'object', readonly: true },
      { name: 'query', kind: 'object', readonly: true },
      { name: 'query.self', kind: 'function', readonly: true },
      { name: 'query.snapshot', kind: 'function', readonly: true },
      { name: 'bot', kind: 'object', readonly: true },
      { name: 'mineflayer', kind: 'object', readonly: true },
      { name: 'mem', kind: 'object', readonly: false },
      { name: 'lastRun', kind: 'object', readonly: true },
      { name: 'prevRun', kind: 'object', readonly: true },
      { name: 'lastAction', kind: 'object', readonly: true },
    ]

    const valueByName: Record<string, unknown> = {
      snapshot: globals.snapshot,
      event: globals.event,
      now: Date.now(),
      self: (globals.snapshot as Record<string, unknown>)?.self,
      environment: (globals.snapshot as Record<string, unknown>)?.environment,
      social: (globals.snapshot as Record<string, unknown>)?.social,
      threat: (globals.snapshot as Record<string, unknown>)?.threat,
      attention: (globals.snapshot as Record<string, unknown>)?.attention,
      autonomy: (globals.snapshot as Record<string, unknown>)?.autonomy,
      llmInput: globals.llmInput ?? null,
      currentInput: globals.currentInput ?? null,
      llmLog: globals.llmLog ?? null,
      actionQueue: globals.actionQueue ?? null,
      noActionBudget: globals.noActionBudget ?? null,
      errorBurstGuard: globals.errorBurstGuard ?? null,
      llmMessages: globals.llmInput?.messages ?? [],
      llmSystemPrompt: globals.llmInput?.systemPrompt ?? '',
      llmUserMessage: globals.llmInput?.userMessage ?? '',
      llmConversationHistory: globals.llmInput?.conversationHistory ?? [],
      query: globals.mineflayer ? createQueryRuntime(globals.mineflayer) : undefined,
      bot: globals.bot ?? globals.mineflayer?.bot,
      mineflayer: globals.mineflayer ?? null,
      mem: this.sandbox.mem,
      lastRun: this.sandbox.lastRun,
      prevRun: this.sandbox.prevRun,
      lastAction: this.sandbox.lastAction,
      skip: this.sandbox.skip,
      use: this.sandbox.use,
      log: this.sandbox.log,
      expect: this.sandbox.expect,
      expectMoved: this.sandbox.expectMoved,
      expectNear: this.sandbox.expectNear,
      setNoActionBudget: this.sandbox.setNoActionBudget,
      getNoActionBudget: this.sandbox.getNoActionBudget,
      forget_conversation: this.sandbox.forget_conversation,
    }

    if (includeBuiltins) {
      for (const item of staticGlobals) {
        descriptors.push({
          ...item,
          preview: this.previewValue(valueByName[item.name]),
        })
      }
    }

    for (const action of availableActions) {
      descriptors.push({
        name: action.name,
        kind: 'tool',
        readonly: true,
        preview: action.description || '(tool)',
      })
    }

    descriptors.sort((a, b) => a.name.localeCompare(b.name))
    return descriptors
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
        throw new Error('log() is only allowed during REPL evaluation')

      const rendered = args.map(arg => inspect(arg, { depth: 4, breakLength: 120 })).join(' ')
      this.activeRun.logs.push(rendered)
      return rendered
    })
    this.defineGlobalTool('expect', (condition: unknown, message?: unknown) => {
      if (condition)
        return true

      const detail = typeof message === 'string' && message.trim().length > 0
        ? message
        : 'Condition evaluated to false'
      throw new Error(`Expectation failed: ${detail}`)
    })
    this.defineGlobalTool('expectMoved', (minBlocks?: unknown, message?: unknown) => {
      const threshold = typeof minBlocks === 'number' ? minBlocks : 0.5
      const telemetry = this.getLastActionResultRecord()
      const movedDistance = typeof telemetry?.movedDistance === 'number'
        ? telemetry.movedDistance
        : null

      if (movedDistance === null) {
        throw new Error('Expectation failed: expectMoved() requires last action result with movedDistance telemetry')
      }

      if (movedDistance >= threshold)
        return true

      const detail = typeof message === 'string' && message.trim().length > 0
        ? message
        : `Expected movedDistance >= ${threshold}, got ${movedDistance}`
      throw new Error(`Expectation failed: ${detail}`)
    })
    this.defineGlobalTool('expectNear', (targetOrMaxDist?: unknown, maxDistOrMessage?: unknown, maybeMessage?: unknown) => {
      const telemetry = this.getLastActionResultRecord()

      let target: { x: number, y: number, z: number } | null = null
      let maxDist = 2
      let message: string | undefined

      if (isCoord(targetOrMaxDist)) {
        target = { x: targetOrMaxDist.x, y: targetOrMaxDist.y, z: targetOrMaxDist.z }
        if (typeof maxDistOrMessage === 'number')
          maxDist = maxDistOrMessage
        if (typeof maybeMessage === 'string')
          message = maybeMessage
      }
      else {
        if (typeof targetOrMaxDist === 'number')
          maxDist = targetOrMaxDist
        if (typeof maxDistOrMessage === 'string')
          message = maxDistOrMessage
      }

      let distance: number | null = null
      if (target) {
        const endPos = isCoord(telemetry?.endPos) ? telemetry.endPos : null
        if (!endPos) {
          throw new Error('Expectation failed: expectNear(target) requires last action result with endPos telemetry')
        }

        const dx = endPos.x - target.x
        const dy = endPos.y - target.y
        const dz = endPos.z - target.z
        distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      }
      else if (typeof telemetry?.distanceToTargetAfter === 'number') {
        distance = telemetry.distanceToTargetAfter
      }

      if (distance === null) {
        throw new Error('Expectation failed: expectNear() requires target argument or last action distanceToTargetAfter telemetry')
      }

      if (distance <= maxDist)
        return true

      const detail = message ?? `Expected distance <= ${maxDist}, got ${distance}`
      throw new Error(`Expectation failed: ${detail}`)
    })
    this.defineGlobalValue('mem', {})
  }

  private getLastActionResultRecord(): Record<string, unknown> | null {
    const lastAction = this.sandbox.lastAction
    if (!isRecord(lastAction))
      return null

    const result = lastAction.result
    return isRecord(result) ? result : null
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
    const llmInput = deepFreeze(toStructuredClone(globals.llmInput ?? null))
    const currentInput = deepFreeze(toStructuredClone(globals.currentInput ?? null))
    const actionQueue = deepFreeze(toStructuredClone(globals.actionQueue ?? null))
    const noActionBudget = deepFreeze(toStructuredClone(globals.noActionBudget ?? null))
    const errorBurstGuard = deepFreeze(toStructuredClone(globals.errorBurstGuard ?? null))
    const query = globals.mineflayer ? createQueryRuntime(globals.mineflayer) : undefined

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
    this.sandbox.llmInput = llmInput
    this.sandbox.currentInput = currentInput
    this.sandbox.llmLog = globals.llmLog ?? null
    this.sandbox.actionQueue = actionQueue
    this.sandbox.noActionBudget = noActionBudget
    this.sandbox.errorBurstGuard = errorBurstGuard
    this.sandbox.setNoActionBudget = globals.setNoActionBudget ?? null
    this.sandbox.getNoActionBudget = globals.getNoActionBudget ?? null
    this.sandbox.forget_conversation = globals.forgetConversation ?? null
    this.sandbox.llmMessages = llmInput?.messages ?? []
    this.sandbox.llmSystemPrompt = llmInput?.systemPrompt ?? ''
    this.sandbox.llmUserMessage = llmInput?.userMessage ?? ''
    this.sandbox.llmConversationHistory = llmInput?.conversationHistory ?? []
    this.sandbox.query = query
    this.sandbox.bot = globals.bot ?? globals.mineflayer?.bot ?? null
    this.sandbox.mineflayer = globals.mineflayer ?? null
    this.sandbox.lastRun = {
      actions: run.executed,
      logs: run.logs,
      returnRaw: undefined,
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
      throw new Error('Tool calls are only allowed during REPL evaluation')
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
      throw new Error('Tool calls are only allowed during REPL evaluation')

    const action = this.activeRun.actionsByName.get(tool)
    if (!action)
      throw new Error(`Unknown tool: ${tool}`)

    const parsed = action.schema.safeParse(params)
    if (!parsed.success) {
      const details = parsed.error.issues
        .map(issue => `${issue.path.map(item => String(item)).join('.') || 'root'}: ${issue.message}`)
        .join('; ')
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

  private previewValue(value: unknown): string {
    if (value === null)
      return 'null'
    if (typeof value === 'undefined')
      return 'undefined'
    if (typeof value === 'string')
      return value.length > 120 ? `${value.slice(0, 117)}...` : value

    const rendered = inspect(value, { depth: 1, breakLength: 120 })
    return rendered.length > 120 ? `${rendered.slice(0, 117)}...` : rendered
  }
}
