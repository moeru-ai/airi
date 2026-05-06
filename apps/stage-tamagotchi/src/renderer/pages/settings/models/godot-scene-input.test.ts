import { DisplayModelFormat } from '@proj-airi/stage-ui/stores/display-models'
import { describe, expect, it } from 'vitest'

import {
  assertGodotSceneInputSupportedDisplayModel,
  isGodotSceneInputSupportedDisplayModel,
} from './godot-scene-input'

describe('godot scene input display model support', () => {
  it('accepts VRM display models for Godot scene input', () => {
    const model = {
      format: DisplayModelFormat.VRM,
      id: 'preset-vrm-1',
      importedAt: 1733113886840,
      name: 'AvatarSample_A',
      type: 'url',
      url: 'https://example.test/AvatarSample_A.vrm',
    } as const

    expect(isGodotSceneInputSupportedDisplayModel(model)).toBe(true)
    expect(() => assertGodotSceneInputSupportedDisplayModel(model)).not.toThrow()
  })

  it('rejects non-VRM display models before Godot scene input is materialized', () => {
    const model = {
      format: DisplayModelFormat.Live2dZip,
      id: 'preset-live2d-1',
      importedAt: 1733113886840,
      name: 'Hiyori',
      type: 'url',
      url: 'https://example.test/hiyori.zip',
    } as const

    expect(isGodotSceneInputSupportedDisplayModel(model)).toBe(false)
    expect(() => assertGodotSceneInputSupportedDisplayModel(model)).toThrow(
      'Godot Stage currently supports VRM models only.',
    )
  })
})
