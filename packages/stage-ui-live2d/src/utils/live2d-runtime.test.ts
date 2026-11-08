import type { Cubism2CoreCapability } from '@proj-airi/unplugin-live2d-sdk/vite'

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { selectLive2DRuntime } from './live2d-runtime'

const cubism2Capability: Cubism2CoreCapability = {
  available: true,
  url: '/live2d.min.js',
  sha256: '0'.repeat(64),
  sri: `sha256-${'0'.repeat(44)}`,
  expectedGlobal: 'Live2D',
  distribution: 'development',
}

function runtime(name: string) {
  return { name }
}

function dependencies(capability: Cubism2CoreCapability = cubism2Capability) {
  return {
    capability,
    loadCore: vi.fn(async () => {}),
    loadCombined: vi.fn(async () => runtime('combined')),
    loadCubism4: vi.fn(async () => runtime('cubism4')),
    configure: vi.fn(async () => {}),
  }
}

describe('live2D runtime selection', () => {
  it('uses Cubism 4 when the optional capability is unavailable', async () => {
    const deps = dependencies({ available: false, reason: 'not-configured' })

    const selected = await selectLive2DRuntime(deps)

    expect(selected.runtime).toEqual(runtime('cubism4'))
    expect(selected.supportsCubism2).toBe(false)
    expect(deps.loadCore).not.toHaveBeenCalled()
    expect(deps.loadCombined).not.toHaveBeenCalled()
    expect(deps.configure).toHaveBeenCalledWith(selected.runtime)
  })

  it('loads the Core before evaluating the combined runtime', async () => {
    const order: string[] = []
    const deps = dependencies()
    deps.loadCore.mockImplementation(async () => {
      order.push('core')
    })
    deps.loadCombined.mockImplementation(async () => {
      order.push('runtime')
      return runtime('combined')
    })

    const selected = await selectLive2DRuntime(deps)

    expect(order).toEqual(['core', 'runtime'])
    expect(selected.supportsCubism2).toBe(true)
  })

  it('falls back to Cubism 4 when Core loading fails', async () => {
    const deps = dependencies()
    deps.loadCore.mockRejectedValue(new Error('CSP blocked the script'))

    const selected = await selectLive2DRuntime(deps)

    expect(selected.runtime).toEqual(runtime('cubism4'))
    expect(selected.supportsCubism2).toBe(false)
    expect(deps.loadCombined).not.toHaveBeenCalled()
    expect(deps.loadCubism4).toHaveBeenCalledOnce()
  })

  it('falls back to Cubism 4 when the combined runtime fails to evaluate', async () => {
    const deps = dependencies()
    deps.loadCombined.mockRejectedValue(new Error('combined runtime failed'))

    const selected = await selectLive2DRuntime(deps)

    expect(selected.runtime).toEqual(runtime('cubism4'))
    expect(selected.supportsCubism2).toBe(false)
    expect(deps.loadCore).toHaveBeenCalledOnce()
    expect(deps.loadCubism4).toHaveBeenCalledOnce()
  })

  // https://github.com/moeru-ai/airi/issues/3291
  //
  // ROOT CAUSE:
  //
  // #3323 patched the screen colors into `dist/cubism4.es.js` only.
  // With a Cubism 2 Core, every model uses the combined bundle:
  //
  // loadCombined: () => import('pixi-live2d-display')
  //
  // Its own renderer copy drew the black block again.
  // We fixed this by patching the combined bundle the same way.
  it('issue #3291: draws the multiply and screen colors in the combined bundle as in the Cubism 4 bundle', async () => {
    const dist = dirname(createRequire(import.meta.url).resolve('pixi-live2d-display'))
    // A Windows checkout can apply patch lines with CRLF endings, so the comparison ignores line endings.
    const readLines = async (fileName: string) => (await readFile(join(dist, fileName), 'utf-8')).split(/\r?\n/)
    const cubism4 = await readLines('cubism4.es.js')
    const combined = new Set(await readLines('index.es.js'))
    const colorLines = cubism4.filter(line => /multiplycolor|screencolor/i.test(line))

    expect(colorLines.length).toBeGreaterThan(0)
    for (const line of colorLines)
      expect(combined.has(line), line).toBe(true)
  })
})
