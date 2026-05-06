import path from 'node:path'
import process from 'node:process'

import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { errorMessageFrom } from '@moeru/std'
import { cac } from 'cac'
import { x } from 'tinyexec'

type AiriScreenshotCommand = 'capture'
type AiriScreenshotTarget = 'tamagotchi'
type AiriScreenshotFormat = 'png' | 'avif'

/** Repository root resolved from this package's source location. */
const repoRootPath = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)))
/** Path to the generic Electron runner package from the repository root. */
const electronRunnerPackagePath = path.join(repoRootPath, 'packages', 'vishot-runner-electron')
/** Root containing product-owned Electron capture scenarios. */
const tamagotchiScenariosRootPath = path.join(repoRootPath, 'packages', 'scenarios-stage-tamagotchi-electron', 'src', 'scenarios')

/**
 * Represents one AIRI screenshot CLI capture request.
 *
 * @param command The top-level CLI command selected by the user.
 */
export interface AiriScreenshotCliArguments {
  /** Screenshot operation to run. */
  command: AiriScreenshotCommand
  /** AIRI surface to capture. */
  target: AiriScreenshotTarget
  /** Preset key or repository-root-relative scenario path. */
  scenario: string
  /** Repository-root-relative output directory for generated images. */
  outputDir: string
  /** Image format passed through to the underlying runner. */
  format: AiriScreenshotFormat
}

const usageMessage = 'Usage: airi-screenshot capture tamagotchi --scenario <preset-or-path> [--output-dir <dir>]'

function normalizeCliArgv(argv: string[]): string[] {
  return argv[0] === '--' ? argv.slice(1) : argv
}

function parseFormat(format: string | undefined): AiriScreenshotFormat {
  if (format === undefined || format.length === 0) {
    return 'png'
  }

  if (format === 'png' || format === 'avif') {
    return format
  }

  throw new Error(`Unsupported screenshot format "${format}". Expected "png" or "avif".`)
}

function createAiriScreenshotCli() {
  const cli = cac('airi-screenshot')

  cli
    .command('capture <target>', 'Capture screenshots for an AIRI surface')
    .option('--scenario <scenario>', 'Scenario id discovered from the target scenario directory, or an explicit scenario file path')
    .option('--output-dir, -o <dir>', 'Directory to write generated screenshots')
    .option('--format <format>', 'Output format: png or avif')

  return cli
}

/**
 * Discovers tamagotchi Electron scenario entrypoints.
 *
 * Use when:
 * - Resolving slash-command scenario ids without maintaining a hardcoded list.
 * - Keeping scenario ownership in `packages/scenarios-stage-tamagotchi-electron`.
 *
 * Expects:
 * - Root `*.ts` files are runnable scenario entrypoints.
 * - First-level folders with `index.ts` are runnable scenario entrypoints.
 *
 * Returns:
 * - A stable id-to-file-path map sorted by scenario id.
 */
export async function discoverTamagotchiScenarios(options: {
  scenariosRoot?: string
} = {}): Promise<Record<string, string>> {
  const scenariosRoot = options.scenariosRoot ?? tamagotchiScenariosRootPath
  const dirents = await readdir(scenariosRoot, { withFileTypes: true })
  const scenarios: Record<string, string> = {}

  for (const dirent of dirents) {
    if (dirent.isFile() && dirent.name.endsWith('.ts')) {
      scenarios[path.basename(dirent.name, '.ts')] = path.join(scenariosRoot, dirent.name)
      continue
    }

    if (!dirent.isDirectory()) {
      continue
    }

    const scenarioEntryPath = path.join(scenariosRoot, dirent.name, 'index.ts')

    try {
      const nestedDirents = await readdir(path.join(scenariosRoot, dirent.name), { withFileTypes: true })
      if (nestedDirents.some(nestedDirent => nestedDirent.isFile() && nestedDirent.name === 'index.ts')) {
        scenarios[dirent.name] = scenarioEntryPath
      }
    }
    catch {
      // Directory vanished between the root scan and nested scan; ignore it for discovery.
    }
  }

  return Object.fromEntries(
    Object.entries(scenarios).sort(([left], [right]) => left.localeCompare(right)),
  )
}

async function resolveTamagotchiScenarioPath(
  scenario: string,
  options: {
    scenariosRoot?: string
  } = {},
): Promise<string> {
  if (scenario.endsWith('.ts') || scenario.includes('/') || scenario.includes('\\')) {
    return path.isAbsolute(scenario) ? scenario : path.join(repoRootPath, scenario)
  }

  const scenarios = await discoverTamagotchiScenarios(options)
  const scenarioPath = scenarios[scenario]

  if (scenarioPath) {
    return scenarioPath
  }

  const availableScenarios = Object.keys(scenarios)
  const availableText = availableScenarios.length > 0
    ? availableScenarios.join(', ')
    : 'none'

  throw new Error(`Unknown tamagotchi scenario "${scenario}". Available scenarios: ${availableText}.`)
}

/**
 * Parses AIRI screenshot CLI arguments into a typed capture request.
 *
 * Use when:
 * - Translating slash-command payloads into local CLI invocations.
 * - Testing AIRI-specific defaults without launching browsers or Electron.
 *
 * Expects:
 * - `argv` starts with `capture tamagotchi`.
 * - Scenario values are either known preset keys or repository-root-relative file paths.
 *
 * Returns:
 * - A normalized request with default format and output directory applied.
 */
export function parseAiriScreenshotCliArguments(argv: string[]): AiriScreenshotCliArguments {
  const normalizedArgv = normalizeCliArgv(argv)
  const cli = createAiriScreenshotCli()
  const parsed = cli.parse(['node', 'airi-screenshot', ...normalizedArgv], { run: false })
  const [command] = normalizedArgv
  const [target] = parsed.args

  if (command !== 'capture') {
    throw new Error(usageMessage)
  }

  if (target !== 'tamagotchi') {
    throw new Error(`Unsupported AIRI screenshot target "${target ?? ''}". Expected "tamagotchi".`)
  }

  const scenario = typeof parsed.options.scenario === 'string' ? parsed.options.scenario : undefined
  const outputDir = typeof parsed.options.outputDir === 'string' ? parsed.options.outputDir : undefined
  const format = typeof parsed.options.format === 'string' ? parsed.options.format : undefined

  if (!scenario) {
    throw new Error(usageMessage)
  }

  return {
    command,
    target,
    scenario,
    outputDir: outputDir ?? path.join('.vishot', 'airi-screenshot', 'tamagotchi'),
    format: parseFormat(format),
  }
}

/**
 * Runs the AIRI screenshot CLI.
 *
 * Use when:
 * - Invoked through `pnpm -F @proj-airi/airi-screenshot capture ...`.
 * - Reusing AIRI-specific screenshot presets from local automation or CI.
 *
 * Expects:
 * - The current working directory is the AIRI repository root.
 *
 * Returns:
 * - Resolves after the delegated Vishot runner exits successfully.
 *
 * Call stack:
 *
 * main
 *   -> {@link parseAiriScreenshotCliArguments}
 *     -> {@link resolveTamagotchiScenarioPath}
 *       -> x
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const request = parseAiriScreenshotCliArguments(argv)
  const scenarioPath = await resolveTamagotchiScenarioPath(request.scenario)
  const outputDir = path.isAbsolute(request.outputDir)
    ? request.outputDir
    : path.join(repoRootPath, request.outputDir)

  // The filtered pnpm command runs from packages/vishot-runner-electron.
  const runnerScenarioPath = scenarioPath.startsWith(repoRootPath)
    ? path.relative(electronRunnerPackagePath, scenarioPath)
    : scenarioPath
  const runnerOutputDir = outputDir.startsWith(repoRootPath)
    ? path.relative(electronRunnerPackagePath, outputDir)
    : outputDir

  const output = await x('pnpm', [
    '-F',
    '@proj-airi/vishot-runner-electron',
    'capture',
    runnerScenarioPath,
    '--output-dir',
    runnerOutputDir,
    '--format',
    request.format,
  ], {
    throwOnError: false,
    nodeOptions: {
      stdio: 'inherit',
    },
  })

  if (output.exitCode !== 0) {
    throw new Error(`AIRI screenshot command exited with code ${output.exitCode ?? 'unknown'}.`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessageFrom(error) ?? usageMessage)
    process.exitCode = 1
  })
}
