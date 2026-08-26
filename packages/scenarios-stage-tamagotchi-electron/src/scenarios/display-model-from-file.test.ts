import type { ElectronApplication } from 'playwright'

import { describe, expect, it } from 'vitest'

import {
  importDisplayModelFromFile,
  resolveDisplayModelInputFromEnvironment,
} from './display-model-from-file'

describe('resolveDisplayModelInputFromEnvironment', () => {
  it('resolves an explicit supported format and absolute input path', () => {
    expect(resolveDisplayModelInputFromEnvironment({
      AIRI_DISPLAY_MODEL_FORMAT: 'live2d',
      AIRI_DISPLAY_MODEL_PATH: '/fixtures/avatar.zip',
    })).toEqual({
      format: 'live2d',
      filePath: '/fixtures/avatar.zip',
    })
  })

  it('rejects an unsupported model format before launching the scenario', () => {
    expect(() => resolveDisplayModelInputFromEnvironment({
      AIRI_DISPLAY_MODEL_FORMAT: 'gltf',
      AIRI_DISPLAY_MODEL_PATH: '/fixtures/avatar.gltf',
    })).toThrowError('AIRI_DISPLAY_MODEL_FORMAT must be live2d, vrm, or mmd')
  })

  it('requires the input path', () => {
    expect(() => resolveDisplayModelInputFromEnvironment({
      AIRI_DISPLAY_MODEL_FORMAT: 'vrm',
    })).toThrowError('AIRI_DISPLAY_MODEL_PATH is required')
  })
})

describe('importDisplayModelFromFile', () => {
  it('rejects relative paths before touching Electron', async () => {
    const electronApp = Object.create(null) as ElectronApplication

    await expect(importDisplayModelFromFile(electronApp, {
      format: 'mmd',
      filePath: 'fixtures/avatar.pmx',
    })).rejects.toThrowError('Display model input must be an absolute path')
  })
})
