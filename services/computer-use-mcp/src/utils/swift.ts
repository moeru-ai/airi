import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from 'node:process'

import { runProcess } from './process'

export async function runSwiftScript(params: {
  source: string
  stdinPayload?: unknown
  swiftBinary: string
  timeoutMs: number
}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'airi-computer-use-'))
  const scriptPath = join(tempDir, 'script.swift')

  await writeFile(scriptPath, params.source, 'utf-8')

  try {
    return await runProcess(params.swiftBinary, [scriptPath], {
      env: params.stdinPayload == null
        ? env
        : {
            ...env,
            COMPUTER_USE_SWIFT_STDIN: JSON.stringify(params.stdinPayload),
          },
      timeoutMs: params.timeoutMs,
    })
  }
  finally {
    await rm(tempDir, { force: true, recursive: true })
  }
}
