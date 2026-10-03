import { describe, expect, it } from 'vitest'

import { formatSherpawLanguageName, formatSherpawModelName, paraformerBilingualZhEn, selectSherpawModel, sherpawModelArtifactUrl, sherpawModels, sherpawModelsForLanguage, xAsrBilingualZhEnInt8, zipformerMultilingual } from './models'

describe('sherpaw model catalogue', () => {
  it('keeps the model name separate from its localized language list', () => {
    expect(paraformerBilingualZhEn.name).toBe('Paraformer')
    expect(formatSherpawModelName(paraformerBilingualZhEn, 'en')).toBe('Paraformer — Chinese, English')
    expect(formatSherpawModelName(paraformerBilingualZhEn, 'zh-Hans')).toBe('Paraformer — 中文, 英语')
  })

  it('declares every language supported by the multilingual model', () => {
    expect(zipformerMultilingual.supportedLanguages).toEqual(['ar', 'en', 'id', 'ja', 'ru', 'th', 'vi', 'zh'])
  })

  it('filters available models by language while retaining every model for the all option', () => {
    const models = Object.values(sherpawModels)

    expect(sherpawModelsForLanguage(models, 'ja').map(model => model.id)).toEqual(['zipformer-multilingual'])
    expect(sherpawModelsForLanguage(models, 'zh').map(model => model.id)).toEqual(models.map(model => model.id))
    expect(sherpawModelsForLanguage(models, 'all')).toEqual(models)
    expect(formatSherpawLanguageName('ja', 'en')).toBe('Japanese')
  })

  it('selects initial models by language and device', () => {
    const models = Object.values(sherpawModels)

    expect(selectSherpawModel(models, 'zh')?.id).toBe(xAsrBilingualZhEnInt8.id)
    expect(selectSherpawModel(models, 'zh', { isMobile: true })?.id).toBe(paraformerBilingualZhEn.id)
    expect(selectSherpawModel(models, 'ja')?.id).toBe(zipformerMultilingual.id)
  })

  it('keeps a compatible current model when the language changes', () => {
    const models = Object.values(sherpawModels)

    expect(selectSherpawModel(models, 'zh', { currentModelId: zipformerMultilingual.id })?.id).toBe(zipformerMultilingual.id)
    expect(selectSherpawModel(models, 'ja', { currentModelId: paraformerBilingualZhEn.id })?.id).toBe(zipformerMultilingual.id)
    expect(selectSherpawModel(models, 'fr', { currentModelId: paraformerBilingualZhEn.id })).toBeUndefined()
  })

  it('offers X-ASR INT8 from its pinned Sherpaw model pack', () => {
    expect(Object.keys(sherpawModels)).toEqual(['paraformer-zh-en', 'zipformer-multilingual', 'x-asr-zh-en-480ms-int8'])
    expect(xAsrBilingualZhEnInt8.recognizer).toBe('transducer')
    expect(xAsrBilingualZhEnInt8.modelingUnit).toBe('')
    expect(zipformerMultilingual.modelingUnit).toBe('cjkchar')
    expect(sherpawModelArtifactUrl(xAsrBilingualZhEnInt8, 'preload.js.metadata')).toBe(
      'https://huggingface.co/moeru-ai/sherpaw-x-asr-zh-en-480ms-int8/resolve/d9ab70a45493b97ae76e08574fcbc5ad0c5d0039/install/bin/wasm/preload.js.metadata',
    )
  })
})
