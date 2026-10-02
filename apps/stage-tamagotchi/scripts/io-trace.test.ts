import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import { IOTraceCaptureWriter } from '../src/main/services/airi/io-trace-recording/capture'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []

function span(): SerializedIOSpan {
  return {
    attributes: { 'ai.moeru.airi.io.subsystem': 'llm' },
    ended: true,
    endTimeNano: '3000000',
    events: [],
    kind: 0,
    name: 'llm.stream',
    parentSpanId: '',
    spanId: 'span-1',
    startTimeNano: '1000000',
    status: { code: 1, message: '' },
    traceId: 'trace-1',
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('iO trace CLI', () => {
  it('inspects the latest capture without starting Electron or an HTTP server', async () => {
    const capturesDirectory = await mkdtemp(join(tmpdir(), 'airi-io-trace-cli-'))
    temporaryDirectories.push(capturesDirectory)
    const writer = await IOTraceCaptureWriter.start({ capturesDirectory, captureId: 'capture-cli' })
    await writer.appendSpan(span())
    await writer.stop()

    const { stdout } = await execFileAsync('pnpm', [
      'exec',
      'tsx',
      join(import.meta.dirname, 'io-trace.ts'),
      'inspect',
      '--directory',
      capturesDirectory,
    ])
    expect(JSON.parse(stdout)).toMatchObject({
      active: false,
      manifest: { captureId: 'capture-cli', spanCount: 1 },
      summary: { spanCount: 1, traceCount: 1 },
    })
  })
})
