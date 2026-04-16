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
const DEFAULT_AVIF_MAX_WIDTH = 1920
/** AVIF quality (0-100, 100 = lossless). 50 is nearly indistinguishable for UI screenshots. */
const DEFAULT_AVIF_QUALITY = 50
/** rav1e speed preset (1 = slow/best, 10 = fast/worst). 6 balances size vs encode time. */
const DEFAULT_AVIF_SPEED = 6

interface AvifCaptureOptions {
  maxWidth: number
  quality: number
  speed: number
}

interface CaptureCliArguments {
  scenarioPath: string
  outputDir: string
  format: CaptureFormat
  avif?: AvifCaptureOptions
}

const captureHelpText = `
  Capture screenshots for a given scenario by running the Electron app and executing the scenario's steps.

  Usage
    $ capture <scenario.ts> --output-dir <dir>

  Options
    --output-dir, -o  Directory to write PNG screenshots into
    --format         Output format: png or avif
    --avif-max-width Max width for AVIF output (default: 1920)
    --avif-quality   AVIF quality between 0-100 (default: 50)
    --avif-speed     AVIF speed between 1-10 (default: 6)

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

function parsePositiveInteger(value: string, description: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Unsupported ${description} "${value}". Expected a whole number.`)
  }

  return Number(value)
}

function parseAvifCaptureOptions(flags: {
  avifMaxWidth?: string
  avifQuality?: string
  avifSpeed?: string
}): AvifCaptureOptions {
  const maxWidth = flags.avifMaxWidth === undefined
    ? DEFAULT_AVIF_MAX_WIDTH
    : parsePositiveInteger(flags.avifMaxWidth, 'AVIF max width')
  const quality = flags.avifQuality === undefined
    ? DEFAULT_AVIF_QUALITY
    : parsePositiveInteger(flags.avifQuality, 'AVIF quality')
  const speed = flags.avifSpeed === undefined
    ? DEFAULT_AVIF_SPEED
    : parsePositiveInteger(flags.avifSpeed, 'AVIF speed')

  if (maxWidth < 1) {
    throw new Error(`Unsupported AVIF max width "${maxWidth}". Expected an integer >= 1.`)
  }

  if (quality < 0 || quality > 100) {
    throw new Error(`Unsupported AVIF quality "${quality}". Expected an integer between 0 and 100.`)
  }

  if (speed < 1 || speed > 10) {
    throw new Error(`Unsupported AVIF speed "${speed}". Expected an integer between 1 and 10.`)
  }

  return {
    maxWidth,
    quality,
    speed,
  }
}

function createAvifTransformer(options: AvifCaptureOptions): ArtifactTransformer {
  return async (artifact) => {
    const derivedFilePath = artifact.filePath.replace(/\.png$/i, '.avif')

    const transformer = new Transformer(await readFile(artifact.filePath))
    const metadata = await transformer.metadata()

    // Downscale images wider than maxWidth, keeping aspect ratio.
    if (metadata.width > options.maxWidth) {
      const scale = options.maxWidth / metadata.width
      transformer.resize(options.maxWidth, Math.round(metadata.height * scale))
    }

    const avifBuffer = await transformer.avif({
      quality: options.quality,
      speed: options.speed,
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
      avifMaxWidth: {
        type: 'string',
      },
      avifQuality: {
        type: 'string',
      },
      avifSpeed: {
        type: 'string',
      },
    },
  })

  if (cli.input.length !== 1
    || typeof cli.flags.outputDir !== 'string'
    || cli.flags.outputDir.length === 0) {
    throw new Error(captureUsageMessage)
  }

  const format = parseCaptureFormat(cli.flags.format)

  return {
    scenarioPath: cli.input[0],
    outputDir: cli.flags.outputDir,
    format,
    avif: format === 'avif'
      ? parseAvifCaptureOptions({
          avifMaxWidth: cli.flags.avifMaxWidth,
          avifQuality: cli.flags.avifQuality,
          avifSpeed: cli.flags.avifSpeed,
        })
      : undefined,
  }
}

async function main(): Promise<void> {
  const { scenarioPath, outputDir, format, avif } = parseCaptureCliArguments(process.argv.slice(2))
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
            transformers: [createAvifTransformer(avif ?? {
              maxWidth: DEFAULT_AVIF_MAX_WIDTH,
              quality: DEFAULT_AVIF_QUALITY,
              speed: DEFAULT_AVIF_SPEED,
            })],
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
