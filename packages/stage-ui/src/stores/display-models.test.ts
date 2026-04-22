import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const displayModelsSource = readFileSync(new URL('./display-models.ts', import.meta.url), 'utf8')

describe('display models store source', () => {
  it('keeps bundled Live2D preset urls runtime-agnostic', () => {
    expect(displayModelsSource).toContain(`new URL('../assets/live2d/models/hiyori_pro_zh.zip', import.meta.url).href`)
    expect(displayModelsSource).toContain(`new URL('../assets/live2d/models/hiyori_free_zh.zip', import.meta.url).href`)
    expect(displayModelsSource).not.toContain('/__airi/live2d/preset/')
  })
})
