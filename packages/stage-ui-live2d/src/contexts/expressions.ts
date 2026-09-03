import type { ComputedRef, Ref, ShallowRef } from 'vue'

import type { Live2DExpressionControl, Live2DExpressionParameterControl } from '../controls/manifest'

import { computed, ref, shallowRef } from 'vue'

export type Live2DExpressionBlendMode = Live2DExpressionParameterControl['blend']

/** One parameter operation from an exp3 expression. */
export type Live2DExpressionParameterDefinition = Live2DExpressionParameterControl

/** One parsed exp3 expression that can register with a Live2D Root. */
export interface Live2DExpressionDefinition extends Live2DExpressionControl {
  parameters: Live2DExpressionParameterDefinition[]
}

/** Runtime state for one parameter controlled by expressions. */
export interface Live2DExpressionParameterState {
  name: string
  parameterId: string
  blend: Live2DExpressionBlendMode
  currentValue: number
  defaultValue: number
  modelDefault: number
  targetValue: number
}

/** Serializable result from one expression operation. */
export interface Live2DExpressionState {
  name: string
  value: number
  default: number
  active: boolean
  autoResetAt?: number
}

/** Result from an expression control operation. */
export interface Live2DExpressionResult {
  success: boolean
  error?: string
  state?: Live2DExpressionState | Live2DExpressionState[]
  available?: string[]
}

/** Requests one expression and an optional automatic reset. */
export interface Live2DExpressionRequest {
  name: string
  /** Duration in seconds. */
  duration?: number
}

/** Applies expression activation to the active Live2D model. */
export interface Live2DExpressionExecutor {
  activate: (name: string) => boolean | Promise<boolean>
  reset: () => boolean
}

/** Minimum Cubism core-model interface used by expression blending. */
export interface Live2DExpressionCoreModel {
  getParameterValueById: (id: string) => number
  setParameterValueById: (id: string, value: number) => void
}

/** Reactive expression state and commands for one Live2D Root. */
export interface Live2DExpressionsContext {
  modelId: Readonly<ShallowRef<string>>
  definitions: Readonly<Ref<Map<string, Live2DExpressionDefinition>>>
  parameters: Readonly<Ref<Map<string, Live2DExpressionParameterState>>>
  available: ComputedRef<Live2DExpressionControl[]>
  enabled: ComputedRef<Live2DExpressionControl[]>
  beginModel: (modelId: string) => void
  register: (definition: Live2DExpressionDefinition) => () => void
  setExecutor: (executor: Live2DExpressionExecutor | undefined) => void
  execute: (request: Live2DExpressionRequest) => Promise<boolean>
  resetExecution: () => Promise<boolean>
  set: (name: string, value: boolean | number, duration?: number) => Live2DExpressionResult
  get: (name?: string) => Live2DExpressionResult
  /** Applies or removes one expression without toggling its current state. */
  setActive: (name: string, active: boolean, duration?: number) => Live2DExpressionResult
  toggle: (name: string, duration?: number) => Live2DExpressionResult
  activate: (name: string, intensity?: number, duration?: number) => Live2DExpressionResult
  reset: () => Live2DExpressionResult
  apply: (coreModel: Live2DExpressionCoreModel) => void
  clear: () => void
}

interface CreateLive2DExpressionsOptions {
  getParameterDefault: (parameterId: string) => number
  isEnabled: (expression: Live2DExpressionControl) => boolean
}

function stateFromParameter(
  parameter: Live2DExpressionParameterState,
  resetAt?: number,
): Live2DExpressionState {
  return {
    name: parameter.name,
    value: parameter.currentValue,
    default: parameter.defaultValue,
    active: parameter.currentValue !== parameter.defaultValue,
    autoResetAt: resetAt,
  }
}

/**
 * Creates the expression registry for one Live2D Root.
 *
 * Each Root receives a separate registry, executor, and timer lifecycle.
 */
export function createLive2DExpressionsContext(
  options: CreateLive2DExpressionsOptions,
): Live2DExpressionsContext {
  const modelId = shallowRef('')
  const definitions = ref(new Map<string, Live2DExpressionDefinition>())
  const parameters = ref(new Map<string, Live2DExpressionParameterState>())
  const parameterResetTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const parameterResetTimes = new Map<string, number>()
  const activeLastFrame = new Set<string>()
  let executor: Live2DExpressionExecutor | undefined
  let executionResetTimer: ReturnType<typeof setTimeout> | undefined
  let executionGeneration = 0

  const available = computed(() => [...definitions.value.values()].map(definition => ({
    name: definition.name,
    fileName: definition.fileName,
    parameters: definition.parameters,
  })))
  const enabled = computed(() => available.value.filter(options.isEnabled))

  function cancelExecutionReset() {
    executionGeneration += 1
    if (executionResetTimer === undefined)
      return

    clearTimeout(executionResetTimer)
    executionResetTimer = undefined
  }

  function clearParameterReset(parameterId: string) {
    const timer = parameterResetTimers.get(parameterId)
    if (timer !== undefined)
      clearTimeout(timer)
    parameterResetTimers.delete(parameterId)
    parameterResetTimes.delete(parameterId)
  }

  function clearParameterResets() {
    for (const timer of parameterResetTimers.values())
      clearTimeout(timer)
    parameterResetTimers.clear()
    parameterResetTimes.clear()
  }

  function rebuildParameters() {
    const previousParameters = parameters.value
    const nextParameters = new Map<string, Live2DExpressionParameterState>()

    for (const definition of definitions.value.values()) {
      for (const parameter of definition.parameters) {
        const previous = previousParameters.get(parameter.parameterId)
        const modelDefault = previous?.modelDefault ?? options.getParameterDefault(parameter.parameterId)
        const existing = nextParameters.get(parameter.parameterId)

        if (existing) {
          if (existing.targetValue === 0 && parameter.value !== 0)
            existing.targetValue = parameter.value
          continue
        }

        nextParameters.set(parameter.parameterId, {
          name: parameter.parameterId,
          parameterId: parameter.parameterId,
          blend: parameter.blend,
          currentValue: previous?.currentValue ?? modelDefault,
          defaultValue: previous?.defaultValue ?? modelDefault,
          modelDefault,
          targetValue: parameter.value,
        })
      }
    }

    for (const parameterId of previousParameters.keys()) {
      if (!nextParameters.has(parameterId))
        clearParameterReset(parameterId)
    }

    parameters.value = nextParameters
  }

  function beginModel(id: string) {
    clear()
    modelId.value = id
  }

  function register(definition: Live2DExpressionDefinition) {
    const currentDefinition = definitions.value.get(definition.name)
    const nextDefinitions = new Map(definitions.value)
    nextDefinitions.set(definition.name, { ...definition, parameters: [...definition.parameters] })
    definitions.value = nextDefinitions
    const registeredDefinition = definitions.value.get(definition.name)
    rebuildParameters()

    return () => {
      if (definitions.value.get(definition.name) !== registeredDefinition)
        return

      const definitionsAfterCleanup = new Map(definitions.value)
      if (currentDefinition)
        definitionsAfterCleanup.set(definition.name, currentDefinition)
      else
        definitionsAfterCleanup.delete(definition.name)
      definitions.value = definitionsAfterCleanup
      rebuildParameters()
    }
  }

  function resolve(name: string) {
    const definition = definitions.value.get(name)
    if (definition)
      return { kind: 'definition' as const, definition }

    const parameter = parameters.value.get(name)
    if (parameter)
      return { kind: 'parameter' as const, parameter }

    return undefined
  }

  function applyParameterValue(
    parameter: Live2DExpressionParameterState,
    value: number,
    duration?: number,
  ) {
    clearParameterReset(parameter.parameterId)
    parameter.currentValue = value

    if (duration === undefined || !Number.isFinite(duration) || duration <= 0)
      return

    const resetAt = Date.now() + duration * 1000
    parameterResetTimes.set(parameter.parameterId, resetAt)
    parameterResetTimers.set(parameter.parameterId, setTimeout(() => {
      parameter.currentValue = parameter.defaultValue
      parameterResetTimers.delete(parameter.parameterId)
      parameterResetTimes.delete(parameter.parameterId)
    }, duration * 1000))
  }

  function resultForDefinition(
    definition: Live2DExpressionDefinition,
    value: (definition: Live2DExpressionParameterDefinition, parameter: Live2DExpressionParameterState) => number,
    duration?: number,
  ): Live2DExpressionResult {
    const states: Live2DExpressionState[] = []

    for (const definitionParameter of definition.parameters) {
      const parameter = parameters.value.get(definitionParameter.parameterId)
      if (!parameter)
        continue

      applyParameterValue(parameter, value(definitionParameter, parameter), duration)
      states.push(stateFromParameter(parameter, parameterResetTimes.get(parameter.parameterId)))
    }

    return { success: true, state: states }
  }

  function set(name: string, value: boolean | number, duration?: number): Live2DExpressionResult {
    const resolved = resolve(name)
    if (!resolved) {
      return {
        success: false,
        error: `Expression or parameter "${name}" was not found.`,
        available: [...definitions.value.keys(), ...parameters.value.keys()],
      }
    }

    const numericValue = typeof value === 'boolean' ? (value ? 1 : 0) : value
    if (resolved.kind === 'definition')
      return resultForDefinition(resolved.definition, () => numericValue, duration)

    applyParameterValue(resolved.parameter, numericValue, duration)
    return {
      success: true,
      state: stateFromParameter(resolved.parameter, parameterResetTimes.get(resolved.parameter.parameterId)),
    }
  }

  function get(name?: string): Live2DExpressionResult {
    if (!name) {
      return {
        success: true,
        state: [...parameters.value.values()].map(parameter => stateFromParameter(
          parameter,
          parameterResetTimes.get(parameter.parameterId),
        )),
      }
    }

    const resolved = resolve(name)
    if (!resolved) {
      return {
        success: false,
        error: `Expression or parameter "${name}" was not found.`,
        available: [...definitions.value.keys(), ...parameters.value.keys()],
      }
    }

    if (resolved.kind === 'parameter') {
      return {
        success: true,
        state: stateFromParameter(resolved.parameter, parameterResetTimes.get(resolved.parameter.parameterId)),
      }
    }

    return {
      success: true,
      state: resolved.definition.parameters.flatMap((definitionParameter) => {
        const parameter = parameters.value.get(definitionParameter.parameterId)
        return parameter
          ? [stateFromParameter(parameter, parameterResetTimes.get(parameter.parameterId))]
          : []
      }),
    }
  }

  function setActive(name: string, active: boolean, duration?: number): Live2DExpressionResult {
    const resolved = resolve(name)
    if (!resolved) {
      return {
        success: false,
        error: `Expression or parameter "${name}" was not found.`,
        available: [...definitions.value.keys(), ...parameters.value.keys()],
      }
    }

    if (resolved.kind === 'parameter') {
      const value = active
        ? resolved.parameter.targetValue
        : resolved.parameter.modelDefault
      applyParameterValue(resolved.parameter, value, duration)
      return {
        success: true,
        state: stateFromParameter(resolved.parameter, parameterResetTimes.get(resolved.parameter.parameterId)),
      }
    }

    return resultForDefinition(
      resolved.definition,
      (definitionParameter, parameter) => active ? definitionParameter.value : parameter.modelDefault,
      duration,
    )
  }

  function toggle(name: string, duration?: number): Live2DExpressionResult {
    const resolved = resolve(name)
    if (!resolved) {
      return {
        success: false,
        error: `Expression or parameter "${name}" was not found.`,
        available: [...definitions.value.keys(), ...parameters.value.keys()],
      }
    }

    const active = resolved.kind === 'parameter'
      ? resolved.parameter.currentValue !== resolved.parameter.modelDefault
      : resolved.definition.parameters.some((definitionParameter) => {
          if (definitionParameter.value === 0)
            return false
          return parameters.value.get(definitionParameter.parameterId)?.currentValue === definitionParameter.value
        })

    return setActive(name, !active, duration)
  }

  function activate(name: string, intensity = 1, duration?: number): Live2DExpressionResult {
    const definition = definitions.value.get(name)
    if (!definition) {
      return {
        success: false,
        error: `Expression "${name}" was not found.`,
        available: [...definitions.value.keys()],
      }
    }

    const normalizedIntensity = Math.min(1, Math.max(0, intensity))
    return resultForDefinition(definition, (definitionParameter, parameter) => {
      switch (definitionParameter.blend) {
        case 'Add':
          return definitionParameter.value * normalizedIntensity
        case 'Multiply':
          return 1 + ((definitionParameter.value - 1) * normalizedIntensity)
        default:
          return parameter.modelDefault + ((definitionParameter.value - parameter.modelDefault) * normalizedIntensity)
      }
    }, duration)
  }

  function reset(): Live2DExpressionResult {
    clearParameterResets()
    const states: Live2DExpressionState[] = []
    for (const parameter of parameters.value.values()) {
      parameter.currentValue = parameter.modelDefault
      states.push(stateFromParameter(parameter))
    }
    return { success: true, state: states }
  }

  function setExecutor(nextExecutor: Live2DExpressionExecutor | undefined) {
    cancelExecutionReset()
    executor = nextExecutor
  }

  async function execute(request: Live2DExpressionRequest): Promise<boolean> {
    if (!enabled.value.some(expression => expression.name === request.name) || !executor)
      return false

    cancelExecutionReset()
    const generation = executionGeneration
    const activeExecutor = executor
    const activated = await activeExecutor.activate(request.name)
    if (!activated || generation !== executionGeneration || activeExecutor !== executor)
      return activated

    if (request.duration !== undefined && Number.isFinite(request.duration) && request.duration > 0) {
      executionResetTimer = setTimeout(() => {
        if (generation !== executionGeneration || activeExecutor !== executor)
          return

        executionResetTimer = undefined
        executionGeneration += 1
        activeExecutor.reset()
      }, request.duration * 1000)
    }

    return true
  }

  async function resetExecution(): Promise<boolean> {
    const activeExecutor = executor
    cancelExecutionReset()
    return activeExecutor?.reset() ?? false
  }

  function apply(coreModel: Live2DExpressionCoreModel) {
    const activeThisFrame = new Set<string>()

    for (const parameter of parameters.value.values()) {
      let isNoop = parameter.currentValue === parameter.modelDefault
      if (parameter.blend === 'Add')
        isNoop = parameter.currentValue === 0
      else if (parameter.blend === 'Multiply')
        isNoop = parameter.currentValue === 1

      if (isNoop)
        continue

      let value = parameter.currentValue
      if (parameter.blend === 'Add')
        value = parameter.modelDefault + parameter.currentValue
      else if (parameter.blend === 'Multiply')
        value = coreModel.getParameterValueById(parameter.parameterId) * parameter.currentValue

      coreModel.setParameterValueById(parameter.parameterId, value)
      activeThisFrame.add(parameter.parameterId)
    }

    for (const parameterId of activeLastFrame) {
      if (activeThisFrame.has(parameterId))
        continue

      const parameter = parameters.value.get(parameterId)
      if (parameter)
        coreModel.setParameterValueById(parameterId, parameter.modelDefault)
    }

    activeLastFrame.clear()
    for (const parameterId of activeThisFrame)
      activeLastFrame.add(parameterId)
  }

  function clear() {
    cancelExecutionReset()
    clearParameterResets()
    activeLastFrame.clear()
    executor = undefined
    modelId.value = ''
    definitions.value = new Map()
    parameters.value = new Map()
  }

  return {
    modelId,
    definitions,
    parameters,
    available,
    enabled,
    beginModel,
    register,
    setExecutor,
    execute,
    resetExecution,
    set,
    get,
    setActive,
    toggle,
    activate,
    reset,
    apply,
    clear,
  }
}

/** Parses one exp3 JSON resource into a registration definition. */
export function parseLive2DExpression(
  name: string,
  fileName: string,
  source: string,
): Live2DExpressionDefinition {
  const value: unknown = JSON.parse(source)
  if (typeof value !== 'object' || value === null || !('Parameters' in value) || !Array.isArray(value.Parameters))
    throw new TypeError(`Expression file "${fileName}" does not contain a Parameters array.`)

  const parameters = value.Parameters.map((parameter) => {
    if (
      typeof parameter !== 'object'
      || parameter === null
      || !('Id' in parameter)
      || typeof parameter.Id !== 'string'
      || !('Value' in parameter)
      || typeof parameter.Value !== 'number'
    ) {
      throw new TypeError(`Expression file "${fileName}" contains an invalid parameter.`)
    }

    let blend: Live2DExpressionBlendMode = 'Overwrite'
    if ('Blend' in parameter && parameter.Blend === 'Add')
      blend = 'Add'
    else if ('Blend' in parameter && parameter.Blend === 'Multiply')
      blend = 'Multiply'

    return {
      parameterId: parameter.Id,
      value: parameter.Value,
      blend,
    } satisfies Live2DExpressionParameterDefinition
  })

  return { name, fileName, parameters }
}
