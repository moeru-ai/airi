import type { ComputedRef, Ref } from 'vue'

import type { Live2DExpressionControl, Live2DExpressionParameterControl } from '../controls/manifest'

import { computed, ref } from 'vue'

export type Live2DExpressionBlendMode = Live2DExpressionParameterControl['blend']

/** One parameter operation from an exp3 expression. */
export type Live2DExpressionParameterDefinition = Live2DExpressionParameterControl

/** One parsed exp3 expression that can register with a Live2D Root. */
export interface Live2DExpressionDefinition extends Live2DExpressionControl {
  parameters: Live2DExpressionParameterDefinition[]
}

/** Runtime state for one parameter controlled by expressions. */
export interface Live2DExpressionParameterState {
  parameterId: string
  blend: Live2DExpressionBlendMode
  activeBlend: Live2DExpressionBlendMode
  currentValue: number
  defaultValue: number
  modelDefault: number
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
  definitions: Readonly<Ref<Map<string, Live2DExpressionDefinition>>>
  parameters: Readonly<Ref<Map<string, Live2DExpressionParameterState>>>
  available: ComputedRef<Live2DExpressionControl[]>
  enabled: ComputedRef<Live2DExpressionControl[]>
  register: (definition: Live2DExpressionDefinition) => () => void
  setExecutor: (executor: Live2DExpressionExecutor | undefined) => void
  execute: (request: Live2DExpressionRequest) => Promise<boolean>
  resetExecution: () => Promise<boolean>
  /** Renders temporary previews over expression state without changing it. */
  setPreviewExpressions: (names: readonly string[]) => void
  /** Applies one registered expression. Returns false for an unknown name. */
  activate: (name: string) => boolean
  reset: () => void
  apply: (coreModel: Live2DExpressionCoreModel) => void
  clear: () => void
}

interface CreateLive2DExpressionsOptions {
  getParameterDefault: (parameterId: string) => number
  isEnabled: (expression: Live2DExpressionControl) => boolean
}

/**
 * Creates the expression registry for one Live2D Root.
 *
 * Each Root receives a separate registry, executor, and timer lifecycle.
 */
export function createLive2DExpressionsContext(
  options: CreateLive2DExpressionsOptions,
): Live2DExpressionsContext {
  const definitions = ref(new Map<string, Live2DExpressionDefinition>())
  const parameters = ref(new Map<string, Live2DExpressionParameterState>())
  const activeLastFrame = new Set<string>()
  let previewExpressionNames: readonly string[] = []
  let previewParameters = new Map<string, Live2DExpressionParameterDefinition>()
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

  function rebuildParameters() {
    const previousParameters = parameters.value
    const nextParameters = new Map<string, Live2DExpressionParameterState>()

    for (const definition of definitions.value.values()) {
      for (const parameter of definition.parameters) {
        if (nextParameters.has(parameter.parameterId))
          continue

        const previous = previousParameters.get(parameter.parameterId)
        const modelDefault = previous?.modelDefault ?? options.getParameterDefault(parameter.parameterId)
        const defaultValue = parameter.blend === 'Add'
          ? 0
          : parameter.blend === 'Multiply' ? 1 : modelDefault

        nextParameters.set(parameter.parameterId, {
          parameterId: parameter.parameterId,
          blend: parameter.blend,
          activeBlend: previous?.activeBlend ?? parameter.blend,
          currentValue: previous?.blend === parameter.blend ? previous.currentValue : defaultValue,
          defaultValue,
          modelDefault,
        })
      }
    }

    parameters.value = nextParameters
  }

  function register(definition: Live2DExpressionDefinition) {
    const currentDefinition = definitions.value.get(definition.name)
    const nextDefinitions = new Map(definitions.value)
    nextDefinitions.set(definition.name, { ...definition, parameters: [...definition.parameters] })
    definitions.value = nextDefinitions
    const registeredDefinition = definitions.value.get(definition.name)
    rebuildParameters()
    setPreviewExpressions(previewExpressionNames)

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
      setPreviewExpressions(previewExpressionNames)
    }
  }

  function setPreviewExpressions(names: readonly string[]) {
    previewExpressionNames = [...names]
    previewParameters = new Map()
    for (const name of names) {
      for (const parameter of definitions.value.get(name)?.parameters ?? [])
        previewParameters.set(parameter.parameterId, parameter)
    }
  }

  function activate(name: string) {
    const definition = definitions.value.get(name)
    if (!definition)
      return false

    for (const definitionParameter of definition.parameters) {
      const parameter = parameters.value.get(definitionParameter.parameterId)
      if (!parameter)
        continue

      parameter.activeBlend = definitionParameter.blend
      parameter.currentValue = definitionParameter.value
    }

    return true
  }

  function reset() {
    for (const parameter of parameters.value.values()) {
      parameter.activeBlend = parameter.blend
      parameter.currentValue = parameter.defaultValue
    }
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
      const preview = previewParameters.get(parameter.parameterId)
      if (!preview && parameter.currentValue === parameter.defaultValue)
        continue

      let value = preview?.value ?? parameter.currentValue
      const blend = preview?.blend ?? parameter.activeBlend
      if (blend === 'Add')
        value = parameter.modelDefault + value
      else if (blend === 'Multiply')
        value = coreModel.getParameterValueById(parameter.parameterId) * value

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
    activeLastFrame.clear()
    previewExpressionNames = []
    previewParameters = new Map()
    executor = undefined
    definitions.value = new Map()
    parameters.value = new Map()
  }

  return {
    definitions,
    parameters,
    available,
    enabled,
    register,
    setExecutor,
    execute,
    resetExecution,
    setPreviewExpressions,
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
