import { describe, expect, it, vi } from 'vitest'

import { emptyLive2DInputMapping, readLive2DInputMapping } from './input-mapping'

async function parseMapping(value: unknown, physics?: unknown) {
  const files: Record<string, string> = { 'avatar.vtube.json': JSON.stringify(value) }
  if (physics !== undefined)
    files['avatar.physics3.json'] = JSON.stringify(physics)
  return readLive2DInputMapping('avatar.model3.json', Object.keys(files), async path => files[path], physics === undefined ? undefined : 'avatar.physics3.json')
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    Input: 'FaceAngleX',
    OutputLive2D: 'ParamTurnInput',
    InputRangeLower: -30,
    InputRangeUpper: 30,
    OutputRangeLower: -10,
    OutputRangeUpper: 10,
    ClampInput: true,
    ClampOutput: true,
    ...overrides,
  }
}

function group(input: string, output: string, weight = 100) {
  return {
    Input: [{ Source: { Target: 'Parameter', Id: input }, Weight: weight }],
    Output: [{ Destination: { Target: 'Parameter', Id: output }, Weight: 100 }],
  }
}

describe('model input mapping discovery', () => {
  it('matches the selected model without taking another model or a metadata sidecar', async () => {
    const files = ['other/avatar.vtube.json', '__MACOSX/avatar.vtube.json', 'model/other.vtube.json', 'model/avatar.vtube.json']
    const readText = vi.fn(async () => JSON.stringify({ ParameterSettings: [row()] }))
    const mapping = await readLive2DInputMapping('model/avatar.model3.json', files, readText)
    const missing = await readLive2DInputMapping('model/missing.model3.json', files, readText)
    expect(mapping.source).toBe('model/avatar.vtube.json')
    expect(missing.status).toBe('missing')
    expect(readText).toHaveBeenCalledTimes(1)
  })

  it('preserves ranges, reversed output, and one source bound to several targets', async () => {
    const mapping = await parseMapping({ ParameterSettings: [row(), row({ OutputLive2D: 'ParamSecondInput', OutputRangeLower: 1, OutputRangeUpper: -1 })] })
    expect(mapping.status).toBe('ready')
    expect(mapping.bindings.map(binding => binding.source)).toEqual(['ParamAngleX', 'ParamAngleX'])
    expect(mapping.bindings[1]).toMatchObject({ inputMin: -30, inputMax: 30, outputMin: 1, outputMax: -1, clampInput: true })
  })

  it('reports unsupported external inputs and malformed rows while retaining supported bindings', async () => {
    const mapping = await parseMapping({ ParameterSettings: [
      row(),
      row({ Input: 'PluginCustomInput', OutputLive2D: 'ParamCustom' }),
      row({ InputRangeLower: 30 }),
      row({ OutputLive2D: 'ParamInvalid', OutputRangeUpper: Number.NaN }),
      row({ OutputLive2D: 'ParamTurnInput' }),
    ] })
    expect(mapping.status).toBe('ready')
    expect(mapping.bindings).toHaveLength(1)
    expect(mapping.issues).toContain('unsupported-input')
    expect(mapping.issues).toContain('invalid-binding')
    expect(mapping.issues).toContain('duplicate-target')
  })

  it('converts the signed AIRI mouth shape to the VTube Studio smile range', async () => {
    const mapping = await parseMapping({ ParameterSettings: [row({ Input: 'MouthSmile' })] })
    expect(mapping.bindings[0]).toMatchObject({ source: 'ParamMouthForm', sourceScale: 0.5, sourceOffset: 0.5 })
  })

  it('does not treat built-in breathing as a supported AIRI tracking signal', async () => {
    const mapping = await parseMapping({ ParameterSettings: [row({ UseBreathing: true })] })
    expect(mapping.status).toBe('unsupported')
    expect(mapping.bindings).toEqual([])
  })

  it('marks the VTube Studio smoothing and blink options without claiming to reproduce them', async () => {
    const mapping = await parseMapping({ ParameterSettings: [row({ Smoothing: 18, UseBlinking: true })] })
    expect(mapping.bindings).toHaveLength(1)
    expect(mapping.issues).toContain('unsupported-options')
  })

  it('finds chained physics destinations while leaving unrelated and zero-weight groups alone', async () => {
    const mapping = await parseMapping({ ParameterSettings: [row()] }, {
      PhysicsSettings: [
        group('ParamBodyAngleX', 'ParamHair'),
        group('ParamTurnInput', 'ParamBodyAngleX'),
        group('ParamBreath', 'ParamChest'),
        group('ParamTurnInput', 'ParamUnrelated', 0),
      ],
    })
    expect(mapping.physicsOutputs).toEqual(['ParamBodyAngleX', 'ParamHair'])
    expect(mapping.bindings[0].physicsOutputs).toEqual(mapping.physicsOutputs)
  })

  it('refuses model routing when the physics graph cannot be read', async () => {
    const mapping = await parseMapping({ ParameterSettings: [row()] }, {})
    expect(mapping.status).toBe('invalid')
    expect(mapping.bindings).toEqual([])
    expect(mapping.issues).toContain('invalid-physics')
  })

  it('reads sidecar and physics text from the same selected model directory', async () => {
    const files: Record<string, string> = {
      'model/avatar.vtube.json': JSON.stringify({ ParameterSettings: [row()] }),
      'model/avatar.physics3.json': JSON.stringify({ PhysicsSettings: [group('ParamTurnInput', 'ParamBodyAngleX')] }),
    }
    const readText = vi.fn(async (path: string) => files[path])
    const mapping = await readLive2DInputMapping('model/avatar.model3.json', Object.keys(files), readText, 'model/avatar.physics3.json')
    expect(mapping.status).toBe('ready')
    expect(mapping.physicsOutputs).toEqual(['ParamBodyAngleX'])
    expect(readText).toHaveBeenCalledWith('model/avatar.vtube.json')
    expect(readText).toHaveBeenCalledWith('model/avatar.physics3.json')
  })

  it('isolates invalid optional JSON and clears metadata when the next model has no sidecar', async () => {
    const readText = vi.fn(async () => '{')
    const invalid = await readLive2DInputMapping('avatar.model3.json', ['avatar.vtube.json'], readText)
    const missing = await readLive2DInputMapping('other.model3.json', ['avatar.vtube.json'], readText)
    expect(invalid.status).toBe('invalid')
    expect(missing).toBe(emptyLive2DInputMapping)
    expect(readText).toHaveBeenCalledTimes(1)
  })
})
