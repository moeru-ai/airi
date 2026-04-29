import type { Action } from '../../libs/mineflayer/action'
import type { Mineflayer } from '../../libs/mineflayer/core'
import type { ActionInstruction } from '../action/types'
import type { BotEvent } from '../types'
import type {
  ActionRuntimeResult,
  QuerySeed,
  RuntimeSnapshot,
  SandboxWorkerRequest,
  SandboxWorkerState,
} from './js-planner-sandbox-protocol'
import type { PatternRuntime } from './patterns/types'

import { inspect } from 'node:util'

import { errorMessageFrom } from '@moeru/std'

import { executeSandboxWorker } from './js-planner-sandbox-runner'
import { createQueryRuntime } from './query-dsl'

interface JavaScriptPlannerOptions {
  bridgeTimeoutMs?: number
  timeoutMs?: number
  maxActionsPerTurn?: number
  maxBridgeCalls?: number
  memoryLimitMb?: number
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

const QUERY_BOOTSTRAP = String.raw`
class PlannerNameQueryChain {
  constructor(values, predicates = [], dedupe = false) {
    this.values = values
    this.predicates = predicates
    this.dedupe = dedupe
  }

  whereIncludes(fragment) {
    const needle = String(fragment).toLowerCase()
    return new PlannerNameQueryChain(
      this.values,
      [...this.predicates, value => String(value).toLowerCase().includes(needle)],
      this.dedupe,
    )
  }

  uniq() {
    return new PlannerNameQueryChain(this.values, this.predicates, true)
  }

  list() {
    let result = this.values.filter(value => this.predicates.every(predicate => predicate(value)))
    if (this.dedupe)
      result = [...new Set(result)]
    return result
  }
}

class PlannerBlockQueryChain {
  constructor(records, state = { range: 16, limit: 200, predicates: [] }) {
    this.records = records
    this.state = state
  }

  within(range) {
    return this.clone({ range: __plannerClamp(Math.floor(range), 1, 64) })
  }

  limit(limit) {
    return this.clone({ limit: __plannerClamp(Math.floor(limit), 1, 500) })
  }

  isOre() {
    return this.clone({ predicates: [...this.state.predicates, block => __plannerIsOreName(block.name)] })
  }

  whereName(nameOrNames) {
    const names = new Set((Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames]).map(name => String(name).toLowerCase()))
    return this.clone({ predicates: [...this.state.predicates, block => names.has(String(block.name).toLowerCase())] })
  }

  sortByDistance() {
    return this
  }

  names() {
    return new PlannerNameQueryChain(this.list().map(block => block.name))
  }

  first() {
    return this.list()[0] ?? null
  }

  list() {
    const filtered = this.records
      .filter(block => typeof block.distance === 'number' && block.distance <= this.state.range)
      .filter(block => this.state.predicates.every(predicate => predicate(block)))
      .sort((a, b) => a.distance - b.distance)
    return filtered.slice(0, this.state.limit)
  }

  clone(patch) {
    return new PlannerBlockQueryChain(this.records, { ...this.state, ...patch })
  }
}

class PlannerEntityQueryChain {
  constructor(records, state = { range: 16, limit: 200, predicates: [] }) {
    this.records = records
    this.state = state
  }

  within(range) {
    return this.clone({ range: __plannerClamp(Math.floor(range), 1, 128) })
  }

  limit(limit) {
    return this.clone({ limit: __plannerClamp(Math.floor(limit), 1, 500) })
  }

  whereType(typeOrTypes) {
    const types = new Set((Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes]).map(type => String(type).toLowerCase()))
    return this.clone({ predicates: [...this.state.predicates, entity => types.has(String(entity.name ?? entity.type).toLowerCase())] })
  }

  names() {
    return new PlannerNameQueryChain(this.list().map(entity => entity.name))
  }

  first() {
    return this.list()[0] ?? null
  }

  list() {
    const filtered = this.records
      .filter(entity => typeof entity.distance === 'number' && entity.distance <= this.state.range)
      .filter(entity => this.state.predicates.every(predicate => predicate(entity)))
      .sort((a, b) => a.distance - b.distance)
    return filtered.slice(0, this.state.limit)
  }

  clone(patch) {
    return new PlannerEntityQueryChain(this.records, { ...this.state, ...patch })
  }
}

class PlannerInventoryQueryChain {
  constructor(records, state = { predicates: [] }) {
    this.records = records
    this.state = state
  }

  whereName(nameOrNames) {
    const names = new Set((Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames]).map(name => String(name).toLowerCase()))
    return this.clone({ predicates: [...this.state.predicates, item => names.has(String(item.name).toLowerCase())] })
  }

  names() {
    return new PlannerNameQueryChain(this.list().map(item => item.name))
  }

  countByName() {
    return this.list().reduce((counts, item) => {
      counts[item.name] = (counts[item.name] ?? 0) + item.count
      return counts
    }, {})
  }

  count(name) {
    const needle = String(name).toLowerCase()
    return this.list()
      .filter(item => String(item.name).toLowerCase() === needle)
      .reduce((sum, item) => sum + item.count, 0)
  }

  has(name, atLeast = 1) {
    return this.count(name) >= Math.max(1, Math.floor(atLeast))
  }

  summary() {
    const counts = this.countByName()
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (b.count !== a.count)
          return b.count - a.count
        return a.name.localeCompare(b.name)
      })
  }

  list() {
    return this.records.filter(item => this.state.predicates.every(predicate => predicate(item)))
  }

  clone(patch) {
    return new PlannerInventoryQueryChain(this.records, { ...this.state, ...patch })
  }
}

function __plannerClamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function __plannerIsOreName(name) {
  return String(name).endsWith('_ore') || name === 'ancient_debris'
}

function __plannerCreateQueryRuntime(seed) {
  if (!seed)
    return undefined

  return {
    self: () => seed.self,
    snapshot: (range = 16) => {
      const normalizedRange = __plannerClamp(Math.floor(range), 1, 64)
      const inventory = new PlannerInventoryQueryChain(seed.inventory)
      const blockQuery = new PlannerBlockQueryChain(seed.blocks).within(normalizedRange).limit(20)
      const entityQuery = new PlannerEntityQueryChain(seed.entities).within(normalizedRange).limit(20)
      return {
        self: seed.self,
        inventory: {
          counts: inventory.countByName(),
          summary: inventory.summary(),
          emptySlots: Math.max(0, 36 - inventory.list().length),
          totalStacks: inventory.list().length,
        },
        nearby: {
          blocks: blockQuery.list(),
          entities: entityQuery.list(),
          ores: blockQuery.isOre().list(),
        },
      }
    },
    blocks: () => new PlannerBlockQueryChain(seed.blocks),
    blockAt: position => __plannerQueryBlockAt ? __plannerQueryBlockAt(position) : null,
    entities: () => new PlannerEntityQueryChain(seed.entities),
    inventory: () => new PlannerInventoryQueryChain(seed.inventory),
    craftable: () => new PlannerNameQueryChain(seed.craftable),
    gaze: options => {
      const range = typeof options?.range === 'number' ? options.range : 16
      return seed.gaze.filter(item => typeof item?.distance !== 'number' || item.distance <= range)
    },
    map: options => __plannerQueryMap ? __plannerQueryMap(options) : null,
  }
}

function __plannerCreateLlmLogRuntime(entries) {
  class PlannerLlmLogQuery {
    constructor(sourceEntries, predicates = [], sorter = undefined, sliceLatest = undefined) {
      this.sourceEntries = sourceEntries
      this.predicates = predicates
      this.sorter = sorter
      this.sliceLatest = sliceLatest
    }

    whereKind(kind) {
      const set = new Set(Array.isArray(kind) ? kind : [kind])
      return this.clone({ predicates: [...this.predicates, entry => set.has(entry.kind)] })
    }

    whereTag(tag) {
      const set = new Set((Array.isArray(tag) ? tag : [tag]).map(item => String(item).toLowerCase()))
      return this.clone({ predicates: [...this.predicates, entry => entry.tags.some(item => set.has(String(item).toLowerCase()))] })
    }

    whereSource(sourceType, sourceId) {
      return this.clone({ predicates: [...this.predicates, entry => {
        if (entry.sourceType !== sourceType)
          return false
        if (sourceId !== undefined)
          return entry.sourceId === sourceId
        return true
      }] })
    }

    errors() {
      return this.whereTag('error')
    }

    turns() {
      return this.whereKind('turn_input')
    }

    between(startTs, endTs) {
      return this.clone({ predicates: [...this.predicates, entry => entry.timestamp >= startTs && entry.timestamp <= endTs] })
    }

    textIncludes(fragment) {
      const needle = String(fragment).toLowerCase()
      return this.clone({ predicates: [...this.predicates, entry => String(entry.text).toLowerCase().includes(needle)] })
    }

    latest(count) {
      return this.clone({ sorter: (a, b) => b.timestamp - a.timestamp, sliceLatest: Math.max(1, Math.floor(count)) })
    }

    list() {
      let result = this.sourceEntries.filter(entry => this.predicates.every(predicate => predicate(entry)))
      if (this.sorter)
        result = [...result].sort(this.sorter)
      if (this.sliceLatest !== undefined)
        result = result.slice(0, this.sliceLatest)
      return result.map(entry => ({ ...entry, tags: [...(entry.tags ?? [])] }))
    }

    first() {
      return this.list()[0] ?? null
    }

    count() {
      return this.list().length
    }

    clone(patch) {
      return new PlannerLlmLogQuery(
        this.sourceEntries,
        patch.predicates ?? this.predicates,
        patch.sorter ?? this.sorter,
        patch.sliceLatest ?? this.sliceLatest,
      )
    }
  }

  return {
    entries: Array.isArray(entries) ? entries.map(entry => ({ ...entry, tags: [...(entry.tags ?? [])] })) : [],
    query: () => new PlannerLlmLogQuery(Array.isArray(entries) ? entries : []),
    latest: (count = 20) => new PlannerLlmLogQuery(Array.isArray(entries) ? entries : []).latest(count).list(),
    byId: (id) => {
      const item = (Array.isArray(entries) ? entries : []).find(entry => entry.id === id)
      return item ? { ...item, tags: [...(item.tags ?? [])] } : null
    },
  }
}

function __plannerCreateHistoryRuntime(seed) {
  if (!seed)
    return null

  const conversationHistory = Array.isArray(seed.conversationHistory) ? seed.conversationHistory : []
  const llmLogEntries = Array.isArray(seed.llmLogEntries) ? seed.llmLogEntries : []
  const currentTurnId = typeof seed.currentTurn === 'number' ? seed.currentTurn : 0

  return {
    recent: (n = 5) => {
      const pairs = []
      for (let i = conversationHistory.length - 1; i >= 0 && pairs.length < n * 2; i--) {
        const msg = conversationHistory[i]
        if (msg.role === 'user' || msg.role === 'assistant') {
          pairs.unshift({
            role: msg.role,
            content: typeof msg.content === 'string' ? msg.content : String(msg.content),
          })
        }
      }
      return pairs.slice(-(n * 2))
    },
    search: (query, maxResults = 10) => {
      if (!query || typeof query !== 'string')
        return []

      const needle = query.toLowerCase()
      const results = []
      for (const msg of conversationHistory) {
        const content = typeof msg.content === 'string' ? msg.content : String(msg.content)
        if (content.toLowerCase().includes(needle)) {
          results.push({
            role: msg.role,
            content: content.length > 300 ? content.slice(0, 297) + '...' : content,
            source: 'conversation',
          })
          if (results.length >= maxResults)
            return results
        }
      }
      return results
    },
    turns: (n = 10) => {
      const turnMap = new Map()
      for (const entry of llmLogEntries) {
        if (entry.kind !== 'turn_input')
          continue

        turnMap.set(entry.turnId, {
          turnId: entry.turnId,
          eventType: entry.eventType,
          actionCount: 0,
          hasError: false,
          text: entry.text,
        })
      }

      for (const entry of llmLogEntries) {
        if (entry.kind !== 'repl_result')
          continue

        const turn = turnMap.get(entry.turnId)
        if (!turn)
          continue

        const meta = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : undefined
        if (meta) {
          turn.actionCount = typeof meta.actionCount === 'number' ? meta.actionCount : 0
          turn.hasError = (typeof meta.errorCount === 'number' && meta.errorCount > 0)
            || (Array.isArray(entry.tags) && entry.tags.includes('error'))
        }
      }

      for (const entry of llmLogEntries) {
        if (entry.kind !== 'repl_error')
          continue

        const turn = turnMap.get(entry.turnId)
        if (turn)
          turn.hasError = true
      }

      const sorted = [...turnMap.values()].sort((a, b) => b.turnId - a.turnId)
      return sorted.slice(0, Math.max(1, Math.floor(n)))
    },
    playerChats: (n = 5) => {
      const chats = []
      for (let i = conversationHistory.length - 1; i >= 0 && chats.length < n; i--) {
        const msg = conversationHistory[i]
        if (msg.role !== 'user' || typeof msg.content !== 'string')
          continue

        const match = msg.content.match(/\[EVENT\]\s*([^:\n]+:[^\n]+)/)
        if (match?.[1] && !match[1].startsWith('Perception Signal:'))
          chats.unshift(match[1])
      }
      return chats
    },
    count: () => conversationHistory.length,
    currentTurn: () => currentTurnId,
  }
}

function __plannerExpectationDetail(message, fallback) {
  if (typeof message === 'string' && message.trim().length > 0)
    return message
  return fallback
}
`

export interface RuntimeGlobals {
  event: BotEvent
  snapshot: Record<string, unknown>
  patterns?: PatternRuntime | null
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
  notifyAiri?: (headline: string, note?: string, urgency?: 'immediate' | 'soon' | 'later') => void
  updateAiriContext?: (text: string, hints?: string[], lane?: string) => void
  history?: unknown
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

function copyForIsolate<T>(value: T): T {
  return deepFreeze(cloneStructured(value))
}

export function extractJavaScriptCandidate(input: string): string {
  const trimmed = input.trim()
  // eslint-disable-next-line regexp/no-super-linear-backtracking
  const fenced = trimmed.match(/^```(?:js|javascript|ts|typescript)?[^\S\r\n]*\r?\n?([\s\S]*?)\r?\n?```$/i)
  if (fenced?.[1])
    return fenced[1].trim()

  return trimmed
}

export class JavaScriptPlanner {
  private activeRun: ActivePlannerRun | null = null
  private readonly bridgeTimeoutMs: number
  private readonly maxActionsPerTurn: number
  private readonly maxBridgeCalls: number
  private persistedLastAction: ActionRuntimeResult | null = null
  private persistedLastRun: { actions: ActionRuntimeResult[], logs: string[], returnRaw?: unknown } | null = null
  private persistedMem: Record<string, unknown> = {}
  private readonly timeoutMs: number
  private readonly memoryLimitMb: number

  constructor(options: JavaScriptPlannerOptions = {}) {
    this.bridgeTimeoutMs = options.bridgeTimeoutMs ?? 30_000
    this.maxBridgeCalls = options.maxBridgeCalls ?? 64
    this.timeoutMs = options.timeoutMs ?? 750
    this.maxActionsPerTurn = options.maxActionsPerTurn ?? 5
    this.memoryLimitMb = options.memoryLimitMb ?? 32
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
    let result: unknown
    let state: SandboxWorkerState = { logs: [], mem: this.persistedMem }

    try {
      const workerResult = await executeSandboxWorker(
        this.buildSandboxWorkerRequest(script, availableActions, globals),
        {
          bridgeTimeoutMs: this.bridgeTimeoutMs,
          maxBridgeCalls: this.maxBridgeCalls,
          onBridgeRequest: (method, args) => this.handleBridgeRequest(method, args, globals),
        },
      )
      state = { logs: workerResult.logs, mem: workerResult.mem }
      result = workerResult.returnRaw
      run.logs = workerResult.logs

      return {
        actions: run.executed,
        logs: workerResult.logs,
        returnValue: typeof result === 'undefined'
          ? undefined
          : inspect(result, {
              depth: null,
              breakLength: 100,
              maxArrayLength: 100,
              maxStringLength: 10_000,
            }),
      }
    }
    catch (error) {
      if (isRecord(error) && 'state' in error && isRecord(error.state)) {
        const errorState = error.state as Partial<SandboxWorkerState>
        state = {
          logs: Array.isArray(errorState.logs) ? cloneStructured(errorState.logs) : [],
          mem: isRecord(errorState.mem) ? cloneStructured(errorState.mem) : {},
        }
        run.logs = state.logs
      }
      throw error
    }
    finally {
      this.persistedMem = cloneStructured(state.mem)
      this.persistedLastRun = {
        actions: cloneStructured(run.executed),
        logs: cloneStructured(state.logs),
        returnRaw: typeof result === 'undefined' ? undefined : cloneStructured(result),
      }
      this.persistedLastAction = run.executed.at(-1)
        ? cloneStructured(run.executed.at(-1) as ActionRuntimeResult)
        : null
      this.activeRun = null
    }
  }

  private buildSandboxWorkerRequest(
    script: string,
    availableActions: Action[],
    globals: RuntimeGlobals,
  ): SandboxWorkerRequest {
    return {
      bootstrapScript: this.buildBootstrapScript(),
      bridgeAvailability: {
        forgetConversation: Boolean(globals.forgetConversation),
        getNoActionBudget: Boolean(globals.getNoActionBudget),
        notifyAiri: Boolean(globals.notifyAiri),
        patternFind: Boolean(globals.patterns?.find),
        patternGet: Boolean(globals.patterns?.get),
        patternIds: Boolean(globals.patterns?.ids),
        patternList: Boolean(globals.patterns?.list),
        queryBlockAt: Boolean(globals.mineflayer),
        queryMap: Boolean(globals.mineflayer),
        setNoActionBudget: Boolean(globals.setNoActionBudget),
        updateAiriContext: Boolean(globals.updateAiriContext),
      },
      memoryLimitMb: this.memoryLimitMb,
      runtime: this.buildRuntimeSnapshot(globals),
      script,
      timeoutMs: this.timeoutMs,
      toolNames: availableActions.map(action => action.name),
    }
  }

  private async handleBridgeRequest(method: string, args: unknown[], globals: RuntimeGlobals): Promise<unknown> {
    switch (method) {
      case 'tool': {
        const [tool, toolArgs] = args
        if (typeof tool !== 'string' || !Array.isArray(toolArgs))
          throw new Error('Sandbox tool bridge received invalid arguments')
        return await this.runActionFromSandbox(tool, toolArgs)
      }

      case 'query.blockAt': {
        if (!globals.mineflayer)
          return null
        const [position] = args
        return cloneStructured(createQueryRuntime(globals.mineflayer).blockAt(position as { x: number, y: number, z: number }))
      }

      case 'query.map': {
        if (!globals.mineflayer)
          return null
        const [options] = args
        return cloneStructured(createQueryRuntime(globals.mineflayer).map(options as {
          radius?: number
          showElevation?: boolean
          showEntities?: boolean
          view?: 'top-down' | 'cross-section'
          yLevel?: number
        }))
      }

      case 'patterns.get':
        return cloneStructured(globals.patterns?.get?.(args[0] as string) ?? null)

      case 'patterns.find':
        return cloneStructured(globals.patterns?.find?.(args[0] as string, args[1] as number | undefined) ?? [])

      case 'patterns.ids':
        return cloneStructured(globals.patterns?.ids?.() ?? [])

      case 'patterns.list':
        return cloneStructured(globals.patterns?.list?.(args[0] as number | undefined) ?? [])

      case 'setNoActionBudget':
        return cloneStructured(globals.setNoActionBudget?.(args[0] as number) ?? null)

      case 'getNoActionBudget':
        return cloneStructured(globals.getNoActionBudget?.() ?? null)

      case 'forgetConversation':
        return cloneStructured(globals.forgetConversation?.() ?? null)

      case 'notifyAiri':
        return cloneStructured(globals.notifyAiri?.(
          args[0] as string,
          args[1] as string | undefined,
          args[2] as 'immediate' | 'soon' | 'later' | undefined,
        ) ?? null)

      case 'updateAiriContext':
        return cloneStructured(globals.updateAiriContext?.(
          args[0] as string,
          args[1] as string[] | undefined,
          args[2] as string | undefined,
        ) ?? null)

      default:
        throw new Error(`Unknown sandbox bridge method: ${method}`)
    }
  }

  public canEvaluateAsExpression(content: string): boolean {
    const script = extractJavaScriptCandidate(content)
    if (!script.trim())
      return false

    try {
      // NOTICE: This parse-only check stays in the host runtime and never executes
      // untrusted code. It only decides whether REPL input can be wrapped as an expression.
      // eslint-disable-next-line no-new-func
      void new Function(`return (async () => (\n${script}\n))()`)
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
    const runtime = this.buildRuntimeSnapshot(globals)

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
      { name: 'history', kind: 'object', readonly: true },
      { name: 'llmMessages', kind: 'object', readonly: true },
      { name: 'llmSystemPrompt', kind: 'string', readonly: true },
      { name: 'llmUserMessage', kind: 'string', readonly: true },
      { name: 'llmConversationHistory', kind: 'object', readonly: true },
      { name: 'query', kind: 'object', readonly: true },
      { name: 'query.self', kind: 'function', readonly: true },
      { name: 'query.snapshot', kind: 'function', readonly: true },
      { name: 'query.gaze', kind: 'function', readonly: true },
      { name: 'patterns', kind: 'object', readonly: true },
      { name: 'patterns.get', kind: 'function', readonly: true },
      { name: 'patterns.find', kind: 'function', readonly: true },
      { name: 'patterns.ids', kind: 'function', readonly: true },
      { name: 'patterns.list', kind: 'function', readonly: true },
      { name: 'bot', kind: 'object', readonly: true },
      { name: 'mineflayer', kind: 'object', readonly: true },
      { name: 'mem', kind: 'object', readonly: false },
      { name: 'lastRun', kind: 'object', readonly: true },
      { name: 'prevRun', kind: 'object', readonly: true },
      { name: 'lastAction', kind: 'object', readonly: true },
      { name: 'notifyAiri', kind: 'function', readonly: true },
      { name: 'updateAiriContext', kind: 'function', readonly: true },
    ]

    const valueByName: Record<string, unknown> = {
      'snapshot': runtime.snapshot,
      'event': runtime.event,
      'now': Date.now(),
      'self': runtime.snapshot.self,
      'environment': runtime.snapshot.environment,
      'social': runtime.snapshot.social,
      'threat': runtime.snapshot.threat,
      'attention': runtime.snapshot.attention,
      'autonomy': runtime.snapshot.autonomy,
      'llmInput': runtime.llmInput,
      'currentInput': runtime.currentInput,
      'llmLog': runtime.llmLogEntries.length > 0 ? { entries: runtime.llmLogEntries } : { entries: [] },
      'actionQueue': runtime.actionQueue,
      'noActionBudget': runtime.noActionBudget,
      'errorBurstGuard': runtime.errorBurstGuard,
      'llmMessages': runtime.llmInput?.messages ?? [],
      'llmSystemPrompt': runtime.llmInput?.systemPrompt ?? '',
      'llmUserMessage': runtime.llmInput?.userMessage ?? '',
      'llmConversationHistory': runtime.llmInput?.conversationHistory ?? [],
      'query': runtime.querySeed
        ? {
            self: '[Function self]',
            snapshot: '[Function snapshot]',
            gaze: '[Function gaze]',
            blocks: '[Function blocks]',
            entities: '[Function entities]',
            inventory: '[Function inventory]',
            craftable: '[Function craftable]',
            blockAt: '[Function blockAt]',
            map: '[Function map]',
          }
        : undefined,
      'patterns': globals.patterns ? { get: '[Function]', find: '[Function]', ids: '[Function]', list: '[Function]' } : null,
      'patterns.get': globals.patterns?.get,
      'patterns.find': globals.patterns?.find,
      'patterns.ids': globals.patterns?.ids,
      'patterns.list': globals.patterns?.list,
      'history': {
        recent: '[Function recent]',
        search: '[Function search]',
        turns: '[Function turns]',
        playerChats: '[Function playerChats]',
        count: '[Function count]',
        currentTurn: '[Function currentTurn]',
      },
      'bot': null,
      'mineflayer': null,
      'mem': this.persistedMem,
      'lastRun': this.persistedLastRun,
      'prevRun': this.persistedLastRun,
      'lastAction': this.persistedLastAction,
      'notifyAiri': globals.notifyAiri ?? null,
      'updateAiriContext': globals.updateAiriContext ?? null,
      'skip': '[Function skip]',
      'use': '[Function use]',
      'log': '[Function log]',
      'expect': '[Function expect]',
      'expectMoved': '[Function expectMoved]',
      'expectNear': '[Function expectNear]',
      'setNoActionBudget': globals.setNoActionBudget ?? null,
      'getNoActionBudget': globals.getNoActionBudget ?? null,
      'forget_conversation': globals.forgetConversation ?? null,
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

  private buildRuntimeSnapshot(globals: RuntimeGlobals): RuntimeSnapshot {
    const llmLogEntries = this.buildLlmLogSeed(globals.llmLog)
    const llmInput = copyForIsolate(globals.llmInput ?? null)

    return {
      actionQueue: copyForIsolate(globals.actionQueue ?? null),
      currentInput: copyForIsolate(globals.currentInput ?? null),
      errorBurstGuard: copyForIsolate(globals.errorBurstGuard ?? null),
      event: copyForIsolate(globals.event),
      historySeed: {
        conversationHistory: this.buildConversationHistorySeed(llmInput?.conversationHistory),
        currentTurn: this.readCurrentTurn(globals.history),
        llmLogEntries,
      },
      lastAction: copyForIsolate(this.persistedLastAction),
      llmInput,
      llmLogEntries,
      mem: copyForIsolate(this.persistedMem),
      noActionBudget: copyForIsolate(globals.noActionBudget ?? null),
      prevRun: copyForIsolate(this.persistedLastRun),
      querySeed: this.buildQuerySeedSafely(globals.mineflayer ?? null),
      snapshot: copyForIsolate(globals.snapshot),
    }
  }

  private buildConversationHistorySeed(messages: unknown): Array<{ role: string, content: string }> {
    if (!Array.isArray(messages))
      return []

    return copyForIsolate(messages.map((message) => {
      const role = isRecord(message) && typeof message.role === 'string' ? message.role : 'unknown'
      const content = isRecord(message) && 'content' in message
        ? typeof message.content === 'string'
          ? message.content
          : String(message.content)
        : ''

      return { role, content }
    }))
  }

  private buildLlmLogSeed(llmLog: unknown): Array<Record<string, unknown>> {
    if (!llmLog || typeof llmLog !== 'object')
      return []

    const entries = (llmLog as { entries?: unknown }).entries
    if (!Array.isArray(entries))
      return []

    return copyForIsolate(
      entries.filter(isRecord).map(entry => ({ ...entry })),
    )
  }

  private readCurrentTurn(history: unknown): number {
    if (!history || typeof history !== 'object')
      return 0

    const currentTurn = (history as { currentTurn?: unknown }).currentTurn
    if (typeof currentTurn !== 'function')
      return 0

    try {
      const value = currentTurn()
      return typeof value === 'number' ? value : 0
    }
    catch {
      return 0
    }
  }

  private buildQuerySeedSafely(mineflayer: Mineflayer | null): QuerySeed | null {
    if (!mineflayer)
      return null

    try {
      return this.buildQuerySeed(mineflayer)
    }
    catch {
      return null
    }
  }

  private buildQuerySeed(mineflayer: Mineflayer): QuerySeed {
    const query = createQueryRuntime(mineflayer)
    return copyForIsolate({
      self: query.self() as unknown as Record<string, unknown>,
      blocks: query.blocks().within(64).limit(500).list() as unknown as Array<Record<string, unknown>>,
      entities: query.entities().within(128).limit(500).list() as unknown as Array<Record<string, unknown>>,
      inventory: query.inventory().list() as unknown as Array<Record<string, unknown>>,
      craftable: query.craftable().uniq().list(),
      gaze: query.gaze({ range: 32 }) as unknown[],
    })
  }

  private buildBootstrapScript(): string {
    return `;(() => {
${QUERY_BOOTSTRAP}
const __plannerBridgeRef = __plannerBridge
const __plannerActionNames = __plannerBootstrapActionNames
const __plannerAvailability = __plannerBridgeAvailability
const __plannerLogRef = __plannerLog
const __plannerReadBridgeValue = payload => {
  const parsed = JSON.parse(payload)
  return parsed?.isUndefined ? undefined : parsed?.value
}
const __plannerCallBridge = (method, args = []) =>
  __plannerReadBridgeValue(__plannerBridgeRef.applySyncPromise(undefined, [method, args], {
    arguments: { copy: true },
  }))
const __plannerQueryBlockAt = __plannerAvailability.queryBlockAt
  ? position => __plannerCallBridge('query.blockAt', [position])
  : null
const __plannerQueryMap = __plannerAvailability.queryMap
  ? options => __plannerCallBridge('query.map', [options])
  : null
const __plannerPatternsAvailable = __plannerAvailability.patternGet
  || __plannerAvailability.patternFind
  || __plannerAvailability.patternIds
  || __plannerAvailability.patternList

globalThis.llmLog = __plannerCreateLlmLogRuntime(globalThis.llmLogSeed)
globalThis.history = __plannerCreateHistoryRuntime(globalThis.historySeed)
globalThis.query = __plannerCreateQueryRuntime(globalThis.querySeed)
globalThis.patterns = __plannerPatternsAvailable
  ? {
      get: id => __plannerCallBridge('patterns.get', [id]),
      find: (query, limit = 10) => __plannerCallBridge('patterns.find', [query, limit]),
      ids: () => __plannerCallBridge('patterns.ids', []),
      list: (limit = 10) => __plannerCallBridge('patterns.list', [limit]),
    }
  : null

globalThis.log = (...args) => {
  const rendered = __plannerLogRef(...args)
  globalThis.lastRun.logs.push(rendered)
  return rendered
}

globalThis.expect = (condition, message) => {
  if (condition)
    return true
  throw new Error(
    'Expectation failed: ' + __plannerExpectationDetail(message, 'Condition evaluated to false'),
  )
}

globalThis.expectMoved = (minBlocks, message) => {
  const threshold = typeof minBlocks === 'number' ? minBlocks : 0.5
  const actionName = globalThis.lastAction?.action?.tool
  const nonMovingActions = [
    'chat', 'giveUp', 'skip', 'stop', 'followPlayer', 'clearFollowTarget',
    'givePlayer', 'consume', 'equip', 'putInChest', 'takeFromChest', 'discard',
    'collectBlocks', 'mineBlockAt', 'craftRecipe', 'smeltItem', 'clearFurnace',
    'placeHere', 'attack', 'attackPlayer', 'activate', 'recipePlan',
  ]

  if (!globalThis.lastAction || (typeof actionName === 'string' && nonMovingActions.includes(actionName)))
    return true

  const movedDistance = typeof globalThis.lastAction?.result?.movedDistance === 'number'
    ? globalThis.lastAction.result.movedDistance
    : 0

  if (movedDistance >= threshold)
    return true

  throw new Error(
    'Expectation failed: ' + __plannerExpectationDetail(message, 'Expected movedDistance >= ' + threshold + ', got ' + movedDistance),
  )
}

globalThis.expectNear = (targetOrMaxDist, maxDistOrMessage, maybeMessage) => {
  let target = null
  let maxDist = 2
  let message

  if (targetOrMaxDist && typeof targetOrMaxDist === 'object' && typeof targetOrMaxDist.x === 'number' && typeof targetOrMaxDist.y === 'number' && typeof targetOrMaxDist.z === 'number') {
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

  let distance = null
  if (target) {
    const endPos = globalThis.lastAction?.result?.endPos
    if (!endPos || typeof endPos.x !== 'number' || typeof endPos.y !== 'number' || typeof endPos.z !== 'number') {
      throw new Error('Expectation failed: expectNear(target) requires last action result with endPos telemetry')
    }

    const dx = endPos.x - target.x
    const dy = endPos.y - target.y
    const dz = endPos.z - target.z
    distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
  else if (typeof globalThis.lastAction?.result?.distanceToTargetAfter === 'number') {
    distance = globalThis.lastAction.result.distanceToTargetAfter
  }

  if (distance === null) {
    throw new Error('Expectation failed: expectNear() requires target argument or last action distanceToTargetAfter telemetry')
  }

  if (distance <= maxDist)
    return true

  throw new Error(
    'Expectation failed: ' + __plannerExpectationDetail(message, 'Expected distance <= ' + maxDist + ', got ' + distance),
  )
}

globalThis.use = (toolName, params = {}) => {
  if (typeof toolName !== 'string' || toolName.length === 0)
    throw new Error('use(toolName, params) requires a non-empty string toolName')

  const invocationArgs = params && typeof params === 'object' && !Array.isArray(params) ? [params] : [{}]
  const runtimeResult = __plannerCallBridge('tool', [toolName, invocationArgs])
  globalThis.lastAction = runtimeResult
  globalThis.lastRun.actions.push(runtimeResult)
  return runtimeResult
}

globalThis.skip = () => globalThis.use('skip', {})

for (const toolName of __plannerActionNames) {
  if (toolName === 'skip')
    continue

  globalThis[toolName] = (...args) => {
    const runtimeResult = __plannerCallBridge('tool', [toolName, args])
    globalThis.lastAction = runtimeResult
    globalThis.lastRun.actions.push(runtimeResult)
    return runtimeResult
  }
}

globalThis.setNoActionBudget = __plannerAvailability.setNoActionBudget
  ? value => __plannerCallBridge('setNoActionBudget', [value])
  : null
globalThis.getNoActionBudget = __plannerAvailability.getNoActionBudget
  ? () => __plannerCallBridge('getNoActionBudget', [])
  : null
globalThis.forget_conversation = __plannerAvailability.forgetConversation
  ? () => __plannerCallBridge('forgetConversation', [])
  : null
globalThis.notifyAiri = __plannerAvailability.notifyAiri
  ? (headline, note, urgency) => __plannerCallBridge('notifyAiri', [headline, note, urgency])
  : null
globalThis.updateAiriContext = __plannerAvailability.updateAiriContext
  ? (text, hints, lane) => __plannerCallBridge('updateAiriContext', [text, hints, lane])
  : null

delete globalThis.querySeed
delete globalThis.llmLogSeed
delete globalThis.historySeed
delete globalThis.__plannerBridge
delete globalThis.__plannerBridgeAvailability
delete globalThis.__plannerBootstrapActionNames
delete globalThis.__plannerLog
})()
`
  }

  private mapToolArgs(tool: string, args: unknown[]): Record<string, unknown> {
    if (!this.activeRun)
      throw new Error('Tool calls are only allowed during REPL evaluation')

    if (tool === 'skip')
      return {}

    const action = this.activeRun.actionsByName.get(tool)
    if (!action)
      throw new Error(`Unknown tool: ${tool}`)

    return this.mapArgsToParams(action, args)
  }

  private async runActionFromSandbox(tool: string, args: unknown[]): Promise<ActionRuntimeResult> {
    return this.runAction(tool, this.mapToolArgs(tool, args))
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
    if (!this.activeRun)
      throw new Error('Tool calls are only allowed during REPL evaluation')

    if (this.activeRun.sawSkip && tool !== 'skip')
      throw new Error('skip() cannot be mixed with other tool calls in the same script')

    if (this.activeRun.actionCount >= this.maxActionsPerTurn)
      throw new Error(`Action limit exceeded: max ${this.maxActionsPerTurn} actions per turn`)

    if (tool === 'skip')
      this.activeRun.sawSkip = true

    this.activeRun.actionCount++

    if (tool === 'skip') {
      const action: ActionInstruction = { tool: 'skip', params: {} }
      const runtimeResult: ActionRuntimeResult = {
        action,
        ok: true,
        result: 'Skipped turn',
      }
      this.activeRun.executed.push(runtimeResult)
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
      return runtimeResult
    }

    const action = validation.action

    try {
      const result = await this.activeRun.executeAction(action)

      // Check if activeRun is still available after async operation
      if (!this.activeRun) {
        throw new Error('Tool calls are only allowed during REPL evaluation')
      }

      const runtimeResult: ActionRuntimeResult = {
        action,
        ok: true,
        result,
      }
      this.activeRun.executed.push(runtimeResult)
      return runtimeResult
    }
    catch (error) {
      // Check if activeRun is still available after async operation
      if (!this.activeRun) {
        throw new Error('Tool calls are only allowed during REPL evaluation')
      }

      const runtimeResult: ActionRuntimeResult = {
        action,
        ok: false,
        error: errorMessageFrom(error) ?? 'Unknown action error',
      }
      this.activeRun.executed.push(runtimeResult)
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
