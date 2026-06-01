import { describe, expect, it } from 'vitest'

import { getDefaultRwkvModel, RWKV_MODELS, rwkvModelsToModelInfo } from './constants'

describe('rwkvModelsToModelInfo', () => {
  /**
   * @example
   * rwkvModelsToModelInfo(true) // -> one ModelInfo per catalog entry
   */
  it('maps every catalog entry to a provider-scoped ModelInfo when WebGPU is available', () => {
    const infos = rwkvModelsToModelInfo(true)

    expect(infos).toHaveLength(RWKV_MODELS.length)
    expect(infos.map(i => i.id)).toEqual(RWKV_MODELS.map(m => m.id))
    expect(infos.every(i => i.provider === 'rwkv-local')).toBe(true)
  })

  /**
   * @example
   * rwkvModelsToModelInfo(false) // -> []
   */
  it('returns an empty list without WebGPU because web-rwkv has no CPU/WASM compute path', () => {
    expect(rwkvModelsToModelInfo(false)).toEqual([])
  })

  /**
   * @example
   * rwkvModelsToModelInfo(true, k => k.toUpperCase())
   */
  it('uses the translator for descriptions and falls back to the raw key without one', () => {
    const translated = rwkvModelsToModelInfo(true, () => 'translated')
    expect(translated[0].description).toBe('translated')

    const untranslated = rwkvModelsToModelInfo(true)
    expect(untranslated[0].description).toBe(RWKV_MODELS[0].descriptionKey)
  })
})

describe('getDefaultRwkvModel', () => {
  /**
   * @example
   * getDefaultRwkvModel(true) // -> 'rwkv7-world-100m-fp16'
   */
  it('defaults to the smallest f16 checkpoint when WebGPU is available', () => {
    const id = getDefaultRwkvModel(true)

    expect(id).toBe('rwkv7-world-100m-fp16')
    expect(RWKV_MODELS.some(m => m.id === id)).toBe(true)
  })

  /**
   * @example
   * getDefaultRwkvModel(false) // -> undefined
   */
  it('returns undefined without WebGPU because nothing is runnable', () => {
    expect(getDefaultRwkvModel(false)).toBeUndefined()
  })
})
