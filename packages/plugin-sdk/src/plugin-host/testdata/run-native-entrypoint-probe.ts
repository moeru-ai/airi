import { execFile } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

type ProbeScenario = 'paths' | 'literal-question-mark' | 'cache' | 'host-reload' | 'missing-entrypoint'

const execFileAsync = promisify(execFile)
const scriptPath = fileURLToPath(new URL('./native-entrypoint-probe.mjs', import.meta.url))

/** Runs the built SDK in native Node and returns the result with the canonical fixture path. */
export async function runNativeEntrypointProbe(scenario: ProbeScenario) {
  const directory = await mkdtemp(join(tmpdir(), 'airi-entrypoint-'))
  try {
    const root = await realpath(directory)
    const { stdout } = await execFileAsync(execPath, [scriptPath, scenario, root])
    return { root, result: JSON.parse(stdout) as unknown }
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}
