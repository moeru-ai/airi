import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from 'node:process'

import { runProcess } from './process'

export async function runSwiftScript(params: {
  swiftBinary: string
  timeoutMs: number
  source: string
  stdinPayload?: unknown
}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'airi-computer-use-'))
  const scriptPath = join(tempDir, 'script.swift')

  await writeFile(scriptPath, params.source, 'utf-8')

  try {
    return await runProcess(params.swiftBinary, [scriptPath], {
      timeoutMs: params.timeoutMs,
      env: params.stdinPayload == null
        ? env
        : {
            ...env,
            COMPUTER_USE_SWIFT_STDIN: JSON.stringify(params.stdinPayload),
          },
    })
  }
  finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
