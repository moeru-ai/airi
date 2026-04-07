import type { CaptureBrowserCliArguments } from '../runtime/types'

import path from 'node:path'
import process from 'node:process'

import { fileURLToPath } from 'node:url'

import meow from 'meow'

import { errorMessageFrom } from '@moeru/std'

import { captureBrowserRoots } from '../runtime/capture'

const captureBrowserHelpText = `
  Capture browser-rendered scenes and export named roots.

  Usage
    $ vishot-runner-browser <render-entry> --output-dir <dir>

  Options
    --output-dir, -o  Directory to write browser capture output into
    --root            Named capture root to export; may be repeated
`

const captureBrowserUsageMessage = 'Usage: vishot-runner-browser <render-entry> --output-dir <dir>'

function normalizeCliArgv(argv: string[]): string[] {
  return argv[0] === '--' ? argv.slice(1) : argv
}

function normalizeRootNames(rootNames: string | string[] | undefined): string[] {
  if (typeof rootNames === 'string') {
    return [rootNames]
  }

  return rootNames ?? []
}

export function parseCaptureBrowserCliArguments(argv: string[]): CaptureBrowserCliArguments {
  const cli = meow(captureBrowserHelpText, {
    argv: normalizeCliArgv(argv),
    importMeta: import.meta,
    flags: {
      outputDir: {
        shortFlag: 'o',
        type: 'string',
      },
      root: {
        isMultiple: true,
        type: 'string',
      },
    },
  })

  if (cli.input.length !== 1
    || typeof cli.flags.outputDir !== 'string'
    || cli.flags.outputDir.length === 0) {
    throw new Error(captureBrowserUsageMessage)
  }

  return {
    renderEntry: cli.input[0],
    outputDir: cli.flags.outputDir,
    rootNames: normalizeRootNames(cli.flags.root),
  }
}

function isDirectExecution(): boolean {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

async function main(): Promise<void> {
  const { outputDir, renderEntry, rootNames } = parseCaptureBrowserCliArguments(process.argv.slice(2))

  await captureBrowserRoots({
    sceneAppRoot: path.resolve(process.cwd(), renderEntry),
    routePath: '/',
    outputDir: path.resolve(process.cwd(), outputDir),
    rootNames,
  })
}

if (isDirectExecution()) {
  void main().catch((error) => {
    console.error(errorMessageFrom(error) ?? captureBrowserUsageMessage)
    process.exitCode = 1
  })
}
