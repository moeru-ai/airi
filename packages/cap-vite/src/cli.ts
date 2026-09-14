const usage = 'cap-vite [vite args...] -- <ios|android> [cap run args...]'

const helpText = [
  'Run a Vite dev server and forward a second argument group to `cap run`.',
  '',
  'Usage:',
  `  ${usage}`,
  '',
  'Examples:',
  '  cap-vite -- ios --target "iPhone 16 Pro"',
  '  cap-vite --host 0.0.0.0 --port 5173 -- android --target emulator-5554 --flavor release',
  '',
  'Notes:',
  '  Arguments before `--` are forwarded to Vite.',
  '  Arguments after `--` are forwarded to `cap run`.',
  '  After the dev server starts, press `R` to re-run `cap run`.',
].join('\n')

export interface ParsedCapViteCliArgs {
  capArgs: string[]
  viteArgs: string[]
}

export function getCapViteCliHelpText(): string {
  return helpText
}

export function getCapViteCliUsage(): string {
  return usage
}

// TODO: CLI and `cap run` argument handling are hand-rolled (see also `resolveCapRunArgs` /
// `hasCapacitorTargetArg` in native.ts). If parsing rules keep growing, adopt a dedicated argv
// library (cac is already a dependency—consider subcommands or a small wrapper) so flags like
// `--target` / `--target=`, env-based defaults, and validation stay in one maintainable layer.

export function parseCapViteCliArgs(argv: string[]): ParsedCapViteCliArgs | null {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    return null
  }

  const separatorIndex = argv.indexOf('--')
  if (separatorIndex === -1) {
    throw new Error(usage)
  }

  const capArgs = argv.slice(separatorIndex + 1)
  if (capArgs.length === 0) {
    throw new Error(usage)
  }

  const platform = capArgs[0]
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error(usage)
  }

  return {
    capArgs,
    viteArgs: argv.slice(0, separatorIndex),
  }
}
