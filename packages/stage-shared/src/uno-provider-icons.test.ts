import { glob } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { createFilter } from 'vite'
import { describe, expect, it } from 'vitest'

import { sharedUnoConfig } from '../../../uno.config'

describe('provider icon extraction', () => {
  // https://github.com/moeru-ai/airi/pull/2567
  // ROOT CAUSE:
  // Provider icons come from package metadata outside the Vite source pipeline.
  // Filesystem scanning and the pipeline filter must both include provider source files.
  it('scans provider source files for PR #2567', async () => {
    const config = sharedUnoConfig()
    const sourceGlob = fileURLToPath(new URL('../../provider-inference/src/**/*.ts', import.meta.url)).replaceAll('\\', '/')
    expect(config.content?.filesystem).toContain(sourceGlob)

    const matches = []
    for await (const path of glob(sourceGlob)) {
      matches.push(path)
    }
    const sourceUrl = new URL('../../provider-inference/src/providers/cloud/anonrouter/index.ts', import.meta.url)
    const sourcePath = fileURLToPath(sourceUrl)
    expect(matches).toContain(sourcePath)

    const pipeline = config.content?.pipeline
    if (!pipeline) {
      throw new Error('Expected the shared content pipeline')
    }
    const filter = createFilter(pipeline.include, pipeline.exclude)
    expect(filter(sourcePath)).toBe(true)
  })
})
