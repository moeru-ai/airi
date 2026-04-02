import path from 'node:path'
import process from 'node:process'

import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import meow from 'meow'

import { errorMessageFrom } from '@moeru/std'
import { _electron as electron } from 'playwright'

import { createScenarioContext } from '../runtime/context'
import { loadScenarioModule } from '../runtime/load-scenario'
import { resolveElectronAppInfo } from '../utils/app-path'

interface CaptureCliArguments {
  scenarioPath: string
  outputDir: string
}

const captureHelpText = `
  Capture screenshots for a given scenario by running the Electron app and executing the scenario's steps.

  Usage
    $ capture <scenario.ts> --output-dir <dir>

  Options
    --output-dir, -o  Directory to write PNG screenshots into

  Examples
    $ capture src/scenarios/settings-connection.ts --output-dir ./artifacts/manual-run
    $ capture src/scenarios/settings-connection.ts -o ./artifacts/manual-run
`

const captureUsageMessage = 'Usage: capture <scenario.ts> --output-dir <dir>'

function normalizeCliArgv(argv: string[]): string[] {
  return argv[0] === '--' ? argv.slice(1) : argv
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) {
    return false
  }

  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

export function parseCaptureCliArguments(argv: string[]): CaptureCliArguments {
  const cli = meow(captureHelpText, {
    argv: normalizeCliArgv(argv),
    importMeta: import.meta,
    flags: {
      outputDir: {
        shortFlag: 'o',
        type: 'string',
      },
    },
  })

  if (cli.input.length !== 1
    || typeof cli.flags.outputDir !== 'string'
    || cli.flags.outputDir.length === 0) {
    throw new Error(captureUsageMessage)
  }

  return {
    scenarioPath: cli.input[0],
    outputDir: cli.flags.outputDir,
  }
}

async function main(): Promise<void> {
  const { scenarioPath, outputDir } = parseCaptureCliArguments(process.argv.slice(2))
  const resolvedOutputDir = path.resolve(process.cwd(), outputDir)

  await mkdir(resolvedOutputDir, { recursive: true })

  const [appInfo, loadedScenario] = await Promise.all([
    resolveElectronAppInfo(),
    loadScenarioModule(scenarioPath),
  ])

  const electronApp = await electron.launch({
    args: [appInfo.mainEntrypoint],
    cwd: appInfo.repoRoot,
  })

  try {
    const context = createScenarioContext(electronApp, resolvedOutputDir)
    await loadedScenario.scenario.run(context)
  }
  finally {
    await electronApp.close()
  }
}

if (isDirectExecution()) {
  void main().catch((error) => {
    console.error(errorMessageFrom(error) ?? 'Unknown CLI error')
    process.exitCode = 1
  })
}
