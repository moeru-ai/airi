import type { CapacitorPlatform } from '.'

import process from 'node:process'

import { cac } from 'cac'

export interface ParsedCapViteCliArgs {
  capArgs: string[]
  platform: CapacitorPlatform
  target: string
}

const usage = 'cap-vite <ios|android> [--target <DEVICE_ID_OR_SIMULATOR_NAME>] [-- <cap args...>]'

function createCapViteCli() {
  const cli = cac('cap-vite')

  cli.help()
  cli
    .command('<platform>', 'Run Capacitor with a Vite dev server')
    .usage(usage)
    .option('--target <target>', 'Set the Capacitor device target')
    .example('cap-vite ios --target "iPhone 16 Pro" -- --scheme AIRI')
    .example('CAPACITOR_DEVICE_ID=emulator-5554 cap-vite android -- --flavor release')

  return cli
}

export function parseCapViteCliArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): ParsedCapViteCliArgs | null {
  const cli = createCapViteCli()
  const parsed = cli.parse(['node', 'cap-vite', ...argv], { run: false })

  if (cli.options.help) {
    return null
  }

  cli.matchedCommand?.checkUnknownOptions()
  cli.matchedCommand?.checkOptionValue()
  cli.matchedCommand?.checkRequiredArgs()

  if (parsed.args.length > 1) {
    throw new Error(usage)
  }

  const platform = parsed.args[0]
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error(usage)
  }

  const target = typeof parsed.options.target === 'string' ? parsed.options.target : env.CAPACITOR_DEVICE_ID
  if (!target) {
    throw new Error(usage)
  }

  return {
    capArgs: Array.isArray(parsed.options['--']) ? parsed.options['--'] : [],
    platform,
    target,
  }
}
