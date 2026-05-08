import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPipelineContext } from '../src/pipeline/context'
import { extractF0Stage } from '../src/pipeline/stages/extract-f0.stage'

const extractSpy = vi.fn()

vi.mock('../src/adapters/pitch/rmvpe.adapter', () => {
  return {
    RmvpeAdapter: class {
      extract = extractSpy
    },
  }
})

describe('extractF0Stage routing', () => {
  const root = resolve(process.cwd(), '.tmp-pipeline-routing')

  afterEach(async () => {
    extractSpy.mockReset()
    await rm(root, { recursive: true, force: true })
  })

  it('prefers isolated lead vocals when they exist', async () => {
    const jobDir = resolve(root, 'job-1')
    await mkdir(resolve(jobDir, '02_separate'), { recursive: true })
    await mkdir(resolve(jobDir, '02b_isolate'), { recursive: true })
    await writeFile(resolve(jobDir, '02_separate', 'vocals.wav'), 'mixed')
    await writeFile(resolve(jobDir, '02b_isolate', 'lead_vocals.wav'), 'lead')

    const ctx = createPipelineContext({
      id: 'job-1',
      request: {} as any,
      outputDir: jobDir,
      createdAt: new Date(),
    }, jobDir)

    await extractF0Stage(ctx)

    expect(extractSpy).toHaveBeenCalledTimes(1)
    expect(extractSpy.mock.calls[0][0].value).toBe(resolve(jobDir, '02b_isolate', 'lead_vocals.wav'))
  })
})
