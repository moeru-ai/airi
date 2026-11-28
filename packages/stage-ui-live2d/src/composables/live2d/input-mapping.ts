import type { Cubism4InternalModel } from 'pixi-live2d-display/cubism4'

import type { Live2DInputBinding, Live2DInputMapping } from '../../controls/input-mapping'

type CubismParameterAccess = Pick<Cubism4InternalModel['coreModel'], | 'getParameterValueById'
  | 'setParameterValueById'
  | 'addParameterValueById'
  | 'multiplyParameterValueById'>

interface OwnedParameter {
  baseline: number
  written: number
}

function clampRange(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(minimum, maximum), Math.max(Math.min(minimum, maximum), value))
}

function bindingValue(binding: Live2DInputBinding, sourceValue: number) {
  let input = sourceValue * binding.sourceScale + binding.sourceOffset
  if (binding.clampInput)
    input = clampRange(input, binding.inputMin, binding.inputMax)

  const fraction = (input - binding.inputMin) / (binding.inputMax - binding.inputMin)
  const output = binding.outputMin + fraction * (binding.outputMax - binding.outputMin)
  return binding.clampOutput ? clampRange(output, binding.outputMin, binding.outputMax) : output
}

/**
 * Routes AIRI parameter writes into one loaded model's input bindings.
 *
 * Authored motions, expressions, and physics use the original model. Only AIRI controls use `model`.
 * `beginFrame` clears the virtual control values before motion updates. Physics runs later through the existing SDK loop.
 *
 * @param TModel The Cubism model or a model with the same parameter API.
 */
export class Live2DInputMapper<TModel extends CubismParameterAccess> {
  readonly model: TModel
  readonly mapping: Live2DInputMapping
  private readonly actualParameters: Set<string>
  private readonly bindings = new Map<string, Live2DInputBinding[]>()
  private readonly physicsOutputs = new Set<string>()
  private readonly values = new Map<string, number>()
  private readonly baseValues = new Map<string, number>()
  private readonly ownedParameters = new Map<string, OwnedParameter>()
  private enabled = false

  constructor(
    private readonly originalModel: TModel,
    mapping: Live2DInputMapping,
    parameterIds: readonly string[],
  ) {
    this.actualParameters = new Set(parameterIds)
    const bindings = mapping.bindings.filter(binding => this.actualParameters.has(binding.target))
    const physicsOutputs = new Set<string>()
    for (const binding of bindings) {
      const sourceBindings = this.bindings.get(binding.source)
      if (sourceBindings)
        sourceBindings.push(binding)
      else
        this.bindings.set(binding.source, [binding])

      for (const output of binding.physicsOutputs ?? []) {
        if (this.actualParameters.has(output))
          physicsOutputs.add(output)
      }
    }
    this.physicsOutputs = physicsOutputs
    this.mapping = {
      ...mapping,
      status: mapping.status === 'ready' && bindings.length === 0 ? 'unsupported' : mapping.status,
      bindings,
      physicsOutputs: [...physicsOutputs],
      issues: bindings.length === mapping.bindings.length ? mapping.issues : [...mapping.issues, 'missing-parameters'],
    }

    const methods: CubismParameterAccess = {
      getParameterValueById: id => this.getParameterValue(id),
      setParameterValueById: (id, value, weight = 1) => {
        if (!this.routesParameter(id)) {
          this.originalModel.setParameterValueById(id, value, weight)
          return
        }
        this.setParameterValue(id, this.getParameterValue(id) * (1 - weight) + value * weight)
      },
      addParameterValueById: (id, value, weight = 1) => {
        if (!this.routesParameter(id)) {
          this.originalModel.addParameterValueById(id, value, weight)
          return
        }
        this.setParameterValue(id, this.getParameterValue(id) + value * weight)
      },
      multiplyParameterValueById: (id, value, weight = 1) => {
        if (!this.routesParameter(id)) {
          this.originalModel.multiplyParameterValueById(id, value, weight)
          return
        }
        this.setParameterValue(id, this.getParameterValue(id) * (1 + (value - 1) * weight))
      },
    }
    const boundMethods = new Map<PropertyKey, unknown>()
    this.model = new Proxy(originalModel, {
      get(target, property) {
        if (Object.hasOwn(methods, property))
          return methods[property as keyof CubismParameterAccess]

        const value = target[property as keyof TModel]
        if (typeof value !== 'function')
          return value

        let bound = boundMethods.get(property)
        if (!bound) {
          bound = value.bind(target)
          boundMethods.set(property, bound)
        }
        return bound
      },
    })
  }

  /** Whether the current frame uses model input bindings. */
  get active() {
    return this.enabled
  }

  /** Starts one SDK frame. A disabled mapper passes parameter calls directly to Cubism. */
  beginFrame(enabled: boolean) {
    if (this.enabled && !enabled)
      this.reset()

    this.enabled = enabled && this.mapping.status === 'ready' && this.mapping.bindings.length > 0
    this.values.clear()
  }

  /** Stores a settings value as the base of future AIRI frames without writing a physics destination. */
  setBaseParameterValue(id: string, value: number) {
    if (!Number.isFinite(value))
      return
    this.baseValues.set(id, value)
    if (!this.routesParameter(id))
      this.originalModel.setParameterValueById(id, value)
  }

  /** Writes the completed AIRI controls after SDK parameter saving and before physics evaluation. */
  flush() {
    if (!this.enabled)
      return
    for (const [id, value] of this.values) {
      const bindings = this.bindings.get(id)
      if (!bindings)
        continue
      for (const binding of bindings) {
        const output = bindingValue(binding, value)
        if (!Number.isFinite(output))
          continue
        const existing = this.ownedParameters.get(binding.target)
        const baseline = existing?.baseline ?? this.originalModel.getParameterValueById(binding.target)
        this.originalModel.setParameterValueById(binding.target, output)
        this.ownedParameters.set(binding.target, {
          baseline,
          written: this.originalModel.getParameterValueById(binding.target),
        })
      }
    }
  }

  /** Restores unchanged input values owned by this mapper when it is disabled or disposed. */
  reset() {
    for (const [id, owned] of this.ownedParameters) {
      // An expression or motion that changed the target after AIRI keeps its own value.
      if (this.originalModel.getParameterValueById(id) === owned.written)
        this.originalModel.setParameterValueById(id, owned.baseline)
    }
    this.ownedParameters.clear()
    this.values.clear()
    this.enabled = false
  }

  private routesParameter(id: string) {
    return this.enabled && (this.bindings.has(id) || this.physicsOutputs.has(id))
  }

  private getParameterValue(id: string): number {
    if (!this.routesParameter(id))
      return this.originalModel.getParameterValueById(id)

    const cached = this.values.get(id)
    if (cached !== undefined)
      return cached

    // A custom input can exist without the standard AIRI parameter. Avoid Cubism's synthetic parameter lookup in that case.
    let value = this.baseValues.get(id)
    if (value === undefined) {
      if (this.actualParameters.has(id))
        value = this.originalModel.getParameterValueById(id)
      else
        value = id === 'ParamEyeLOpen' || id === 'ParamEyeROpen' ? 1 : 0
    }
    this.values.set(id, value)
    return value
  }

  private setParameterValue(id: string, value: number) {
    if (!Number.isFinite(value))
      return

    this.values.set(id, value)
  }
}
