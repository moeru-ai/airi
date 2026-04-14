import type { ArtifactTransformer } from '../runtime/types'

import path from 'node:path'
import process from 'node:process'

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import meow from 'meow'

import { errorMessageFrom } from '@moeru/std'
import { Transformer } from '@napi-rs/image'
import { _electron as electron } from 'playwright'

import { createScenarioContext } from '../runtime/context'
import { loadScenarioModule } from '../runtime/load-scenario'
import { resolveElectronAppInfo } from '../utils/app-path'

type CaptureFormat = 'png' | 'avif'

/** Max width for AVIF output — anything wider is downscaled proportionally. */
const AVIF_MAX_WIDTH = 1920
/** AVIF quality (0-100, 100 = lossless). 50 is nearly indistinguishable for UI screenshots. */
const AVIF_QUALITY = 50
/** rav1e speed preset (1 = slow/best, 10 = fast/worst). 6 balances size vs encode time. */
const AVIF_SPEED = 6

interface CaptureCliArguments {
  scenarioPath: string
  outputDir: string
  format: CaptureFormat
}

const captureHelpText = `
  Capture screenshots for a given scenario by running the Electron app and executing the scenario's steps.

  Usage
    $ capture <scenario.ts> --output-dir <dir>

  Options
    --output-dir, -o  Directory to write PNG screenshots into
    --format         Output format: png or avif

  Examples
    $ capture packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts --output-dir ./artifacts/manual-run
    $ capture packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts -o ./artifacts/manual-run
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

function parseCaptureFormat(format: string | undefined): CaptureFormat {
  if (format === undefined || format.length === 0) {
    return 'png'
  }

  if (format === 'png' || format === 'avif') {
    return format
  }

  throw new Error(`Unsupported capture format "${format}". Expected "png" or "avif".`)
}

function createAvifTransformer(): ArtifactTransformer {
  return async (artifact) => {
    const derivedFilePath = artifact.filePath.replace(/\.png$/i, '.avif')

    const transformer = new Transformer(await readFile(artifact.filePath))
    const metadata = await transformer.metadata()

    // Downscale images wider than AVIF_MAX_WIDTH, keeping aspect ratio
    if (metadata.width > AVIF_MAX_WIDTH) {
      const scale = AVIF_MAX_WIDTH / metadata.width
      transformer.resize(AVIF_MAX_WIDTH, Math.round(metadata.height * scale))
    }

    const avifBuffer = await transformer.avif({
      quality: AVIF_QUALITY,
      speed: AVIF_SPEED,
    })

    await writeFile(derivedFilePath, avifBuffer)
    await rm(artifact.filePath, { force: true })

    return {
      ...artifact,
      filePath: derivedFilePath,
      format: 'avif',
    }
  }
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
      format: {
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
    format: parseCaptureFormat(cli.flags.format),
  }
}

async function main(): Promise<void> {
  const { scenarioPath, outputDir, format } = parseCaptureCliArguments(process.argv.slice(2))
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
    const context = createScenarioContext(
      electronApp,
      resolvedOutputDir,
      format === 'avif'
        ? {
            transformers: [createAvifTransformer()],
          }
        : undefined,
    )
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
