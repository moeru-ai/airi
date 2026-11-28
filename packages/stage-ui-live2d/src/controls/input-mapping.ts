import * as v from 'valibot'

/** Selects the parameter bindings that adapt AIRI controls to one model. */
export type Live2DInputMappingMode = 'default' | 'model'

/** Canonical AIRI controls that have a corresponding VTube Studio input. */
export type Live2DInputSource
  = | 'ParamAngleX'
    | 'ParamAngleY'
    | 'ParamAngleZ'
    | 'ParamEyeBallX'
    | 'ParamEyeBallY'
    | 'ParamEyeLOpen'
    | 'ParamEyeROpen'
    | 'ParamMouthOpenY'
    | 'ParamMouthForm'

/** One author-defined input binding. Several bindings can share one source. */
export interface Live2DInputBinding {
  source: Live2DInputSource
  target: string
  /** Converts an AIRI control to VTube Studio input units before range conversion. */
  sourceScale: number
  sourceOffset: number
  inputMin: number
  inputMax: number
  outputMin: number
  outputMax: number
  clampInput: boolean
  clampOutput: boolean
  /** Imported metadata. AIRI keeps its own motion smoothing. */
  smoothing: number
  /** Destinations affected by this target. The runtime uses only bindings with existing targets. */
  physicsOutputs?: string[]
}

export type Live2DInputMappingIssue = 'invalid-binding' | 'unsupported-input' | 'unsupported-options' | 'duplicate-target' | 'invalid-physics' | 'missing-parameters'

/** Discovered bindings belong to one loaded model and never persist as runtime state. */
export interface Live2DInputMapping {
  status: 'missing' | 'ready' | 'invalid' | 'unsupported'
  bindings: Live2DInputBinding[]
  /** Physics destinations reachable from the configured inputs, including chained groups. */
  physicsOutputs: string[]
  source?: string
  issues: Live2DInputMappingIssue[]
}

/** Stable empty metadata for a model without a matching sidecar. */
export const emptyLive2DInputMapping: Live2DInputMapping = {
  status: 'missing',
  bindings: [],
  physicsOutputs: [],
  issues: [],
}

const finiteNumber = v.pipe(v.number(), v.finite())
const parameterId = v.pipe(v.string(), v.trim(), v.nonEmpty())
const bindingSchema = v.object({
  Input: v.string(),
  OutputLive2D: parameterId,
  InputRangeLower: finiteNumber,
  InputRangeUpper: finiteNumber,
  OutputRangeLower: finiteNumber,
  OutputRangeUpper: finiteNumber,
  ClampInput: v.optional(v.boolean(), false),
  ClampOutput: v.optional(v.boolean(), false),
  Smoothing: v.optional(v.pipe(finiteNumber, v.minValue(0), v.maxValue(100)), 0),
  UseBreathing: v.optional(v.boolean(), false),
  UseBlinking: v.optional(v.boolean(), false),
})
const settingsSchema = v.object({ ParameterSettings: v.array(v.unknown()) })

// VTS input names: https://github.com/DenchiSoft/VTubeStudio/wiki/VTS-Model-Settings
const supportedInputs: Record<string, { source: Live2DInputSource, scale: number, offset: number }> = {
  FaceAngleX: { source: 'ParamAngleX', scale: 1, offset: 0 },
  FaceAngleY: { source: 'ParamAngleY', scale: 1, offset: 0 },
  FaceAngleZ: { source: 'ParamAngleZ', scale: 1, offset: 0 },
  EyeLeftX: { source: 'ParamEyeBallX', scale: 1, offset: 0 },
  EyeRightX: { source: 'ParamEyeBallX', scale: 1, offset: 0 },
  EyeLeftY: { source: 'ParamEyeBallY', scale: 1, offset: 0 },
  EyeRightY: { source: 'ParamEyeBallY', scale: 1, offset: 0 },
  EyeOpenLeft: { source: 'ParamEyeLOpen', scale: 1, offset: 0 },
  EyeOpenRight: { source: 'ParamEyeROpen', scale: 1, offset: 0 },
  MouthOpen: { source: 'ParamMouthOpenY', scale: 1, offset: 0 },
  MouthSmile: { source: 'ParamMouthForm', scale: 0.5, offset: 0.5 },
}

/** Reads the supported bindings without guessing custom tracking or plugin inputs. */
function readVTubeStudioInputMapping(value: unknown, source?: string): Live2DInputMapping {
  const settings = v.safeParse(settingsSchema, value)
  const bindings: Live2DInputBinding[] = []
  const issues = new Set<Live2DInputMappingIssue>()
  const targets = new Set<string>()
  if (!settings.success) {
    return { status: 'invalid', bindings, physicsOutputs: [], source, issues: ['invalid-binding'] }
  }

  for (const row of settings.output.ParameterSettings) {
    const result = v.safeParse(bindingSchema, row)
    if (!result.success || result.output.InputRangeLower === result.output.InputRangeUpper) {
      issues.add('invalid-binding')
      continue
    }

    const input = Object.hasOwn(supportedInputs, result.output.Input) ? supportedInputs[result.output.Input] : undefined
    if (!input || result.output.UseBreathing) {
      issues.add('unsupported-input')
      continue
    }

    if (targets.has(result.output.OutputLive2D)) {
      issues.add('duplicate-target')
      continue
    }
    targets.add(result.output.OutputLive2D)

    if (result.output.Smoothing > 0 || result.output.UseBlinking)
      issues.add('unsupported-options')

    bindings.push({
      source: input.source,
      target: result.output.OutputLive2D,
      sourceScale: input.scale,
      sourceOffset: input.offset,
      inputMin: result.output.InputRangeLower,
      inputMax: result.output.InputRangeUpper,
      outputMin: result.output.OutputRangeLower,
      outputMax: result.output.OutputRangeUpper,
      clampInput: result.output.ClampInput,
      clampOutput: result.output.ClampOutput,
      smoothing: result.output.Smoothing,
    })
  }

  let status: Live2DInputMapping['status'] = 'unsupported'
  if (bindings.length > 0)
    status = 'ready'
  else if (issues.has('invalid-binding'))
    status = 'invalid'
  return { status, bindings, physicsOutputs: [], source, issues: [...issues] }
}

/** Matches only the sidecar with the selected model's exact directory and stem. */
function selectLive2DInputMappingPath(modelSettingsPath: string, filePaths: string[]): string | undefined {
  if (!/\.model3?\.json$/i.test(modelSettingsPath))
    return undefined
  const sidecarPath = modelSettingsPath.replace(/\.model3?\.json$/i, '.vtube.json')
  return filePaths.find(path => path === sidecarPath)
}

/** Reads an optional matching sidecar and its physics graph without blocking the model load. */
export async function readLive2DInputMapping(
  modelSettingsPath: string,
  filePaths: string[],
  readText: (path: string) => Promise<string>,
  physicsPath?: string,
): Promise<Live2DInputMapping> {
  const path = selectLive2DInputMappingPath(modelSettingsPath, filePaths)
  if (!path)
    return emptyLive2DInputMapping

  let mapping: Live2DInputMapping
  try {
    mapping = readVTubeStudioInputMapping(JSON.parse(await readText(path)), path)
  }
  catch {
    // An optional sidecar cannot prevent the model from loading.
    return readVTubeStudioInputMapping(undefined, path)
  }

  if (!physicsPath || mapping.status !== 'ready')
    return mapping

  try {
    return withLive2DInputMappingPhysics(mapping, JSON.parse(await readText(physicsPath)))
  }
  catch {
    return withLive2DInputMappingPhysics(mapping, undefined)
  }
}

const physicsParameterSchema = v.object({ Target: v.literal('Parameter'), Id: parameterId })
const physicsGroupSchema = v.object({
  Input: v.array(v.object({ Source: physicsParameterSchema, Weight: v.optional(finiteNumber, 100) })),
  Output: v.array(v.object({ Destination: physicsParameterSchema, Weight: v.optional(finiteNumber, 100) })),
})
const physicsSchema = v.object({ PhysicsSettings: v.array(physicsGroupSchema) })

/** Adds the physics destinations affected by these bindings without claiming unrelated physics outputs. */
function withLive2DInputMappingPhysics(mapping: Live2DInputMapping, value: unknown): Live2DInputMapping {
  const physics = v.safeParse(physicsSchema, value)
  if (!physics.success) {
    return { ...mapping, status: 'invalid', bindings: [], physicsOutputs: [], issues: [...mapping.issues, 'invalid-physics'] }
  }
  const groups = physics.output.PhysicsSettings

  function outputsFor(target: string): string[] {
    const reachable = new Set([target])
    const outputs = new Set<string>()
    let changed = true
    // A destination can feed an earlier group on a later frame. Reachability includes these chains.
    while (changed) {
      changed = false
      for (const group of groups) {
        if (!group.Input.some(input => input.Weight !== 0 && reachable.has(input.Source.Id)))
          continue
        for (const output of group.Output) {
          if (output.Weight === 0)
            continue
          outputs.add(output.Destination.Id)
          if (!reachable.has(output.Destination.Id)) {
            reachable.add(output.Destination.Id)
            changed = true
          }
        }
      }
    }
    return [...outputs]
  }
  const bindings = mapping.bindings.map(binding => ({ ...binding, physicsOutputs: outputsFor(binding.target) }))
  const physicsOutputs = [...new Set(bindings.flatMap(binding => binding.physicsOutputs))]
  return { ...mapping, bindings, physicsOutputs }
}
