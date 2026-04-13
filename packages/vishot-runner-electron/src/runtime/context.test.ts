import { describe, expect, it, vi } from 'vitest'

import { createScenarioContext } from './context'

vi.mock('./capture', () => {
  return {
    capturePage: vi.fn(async (_outputDir, name, _page, options) => [{ name, options }]),
  }
})

describe('createScenarioContext', () => {
  it('merges default transformers with per-capture transformers', async () => {
    const { capturePage } = await import('./capture')
    const defaultTransformer = vi.fn(async artifact => artifact)
    const perCaptureTransformer = vi.fn(async artifact => artifact)
    const electronApp = {} as never
    const page = {} as never
    const context = createScenarioContext(electronApp, '/tmp/output', {
      transformers: [defaultTransformer],
    })

    await context.capture('settings-window', page, {
      fullPage: true,
      transformers: [perCaptureTransformer],
    })

    expect(capturePage).toHaveBeenCalledWith(
      '/tmp/output',
      'settings-window',
      page,
      expect.objectContaining({
        fullPage: true,
        transformers: [defaultTransformer, perCaptureTransformer],
      }),
    )
  })
})
