import type { Output } from 'tinyexec'

import process from 'node:process'

import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { x } from 'tinyexec'

import { parseCapacitorPlatform } from './native'

export type { CapacitorPlatform } from './native'

export interface RunCapViteOptions {
  cwd?: string
}

interface PreparedViteLaunch {
  baseConfigFile?: string
  configLoader?: 'bundle' | 'native' | 'runner'
  projectRoot: string
  viteArgs: string[]
  wrapperConfigFile: string
}

interface ParsedViteArg {
  baseConfigFile?: string
  configLoader?: 'bundle' | 'native' | 'runner'
  consumedArgs: number
  forwardedArgs: string[]
}

function resolveWrapperConfigFile(): string {
  const currentModulePath = fileURLToPath(import.meta.url)
  const wrapperExtension = extname(currentModulePath) === '.ts' ? '.ts' : '.mjs'
  return fileURLToPath(new URL(`./vite-wrapper-config${wrapperExtension}`, import.meta.url))
}

function parseViteConfigLoader(value: string | undefined): 'bundle' | 'native' | 'runner' | undefined {
  if (value === 'bundle' || value === 'native' || value === 'runner') {
    return value
  }

  return undefined
}

function resolveConfigPath(cwd: string, value: string): string {
  return resolve(cwd, value)
}

function readRequiredOptionValue(viteArgs: string[], index: number, optionName: string): string {
  const value = viteArgs[index + 1]
  if (!value) {
    throw new Error(`Missing value for \`${optionName}\`.`)
  }

  return value
}

function parseConfigArg(viteArgs: string[], index: number, cwd: string): ParsedViteArg | null {
  const arg = viteArgs[index]

  // NOTICE: Vite only accepts one `--config` entrypoint. cap-vite consumes that slot
  // for its wrapper config, then loads the user config from inside the wrapper.
  if (arg === '--config' || arg === '-c') {
    return {
      baseConfigFile: resolveConfigPath(cwd, readRequiredOptionValue(viteArgs, index, '--config')),
      consumedArgs: 2,
      forwardedArgs: [],
    }
  }

  if (arg.startsWith('--config=')) {
    return {
      baseConfigFile: resolveConfigPath(cwd, arg.slice('--config='.length)),
      consumedArgs: 1,
      forwardedArgs: [],
    }
  }

  return null
}

function parseConfigLoaderArg(viteArgs: string[], index: number): ParsedViteArg | null {
  const arg = viteArgs[index]

  if (arg === '--configLoader') {
    const value = readRequiredOptionValue(viteArgs, index, '--configLoader')

    return {
      configLoader: parseViteConfigLoader(value),
      consumedArgs: 2,
      forwardedArgs: [arg, value],
    }
  }

  if (arg.startsWith('--configLoader=')) {
    return {
      configLoader: parseViteConfigLoader(arg.slice('--configLoader='.length)),
      consumedArgs: 1,
      forwardedArgs: [arg],
    }
  }

  return null
}

function parseViteArg(viteArgs: string[], index: number, cwd: string): ParsedViteArg {
  return parseConfigArg(viteArgs, index, cwd)
    ?? parseConfigLoaderArg(viteArgs, index)
    ?? {
      consumedArgs: 1,
      forwardedArgs: [viteArgs[index]],
    }
}

function resolveProjectRoot(viteArgs: string[], cwd: string): string {
  const firstArg = viteArgs[0]

  return firstArg && !firstArg.startsWith('-')
    ? resolve(cwd, firstArg)
    : cwd
}

export function prepareCapViteLaunch(viteArgs: string[], cwd: string = process.cwd()): PreparedViteLaunch {
  const resolvedCwd = resolve(cwd)
  const projectRoot = resolveProjectRoot(viteArgs, resolvedCwd)

  let baseConfigFile: string | undefined
  let configLoader: 'bundle' | 'native' | 'runner' | undefined
  const forwardedViteArgs: string[] = []

  for (let index = 0; index < viteArgs.length;) {
    const parsedArg = parseViteArg(viteArgs, index, resolvedCwd)

    baseConfigFile = parsedArg.baseConfigFile ?? baseConfigFile
    configLoader = parsedArg.configLoader ?? configLoader
    forwardedViteArgs.push(...parsedArg.forwardedArgs)
    index += parsedArg.consumedArgs
  }

  return {
    baseConfigFile,
    configLoader,
    projectRoot,
    viteArgs: forwardedViteArgs,
    wrapperConfigFile: resolveWrapperConfigFile(),
  }
}

export async function runCapVite(
  viteArgs: string[],
  capArgs: string[],
  options: RunCapViteOptions = {},
): Promise<Output> {
  if (!parseCapacitorPlatform(capArgs[0])) {
    throw new Error('The first `cap run` argument must be `ios` or `android`.')
  }

  const cwd = resolve(options.cwd ?? process.cwd())
  const prepared = prepareCapViteLaunch(viteArgs, cwd)

  return await x('vite', ['--config', prepared.wrapperConfigFile, ...prepared.viteArgs], {
    throwOnError: false,
    nodeOptions: {
      cwd,
      env: {
        CAP_VITE_BASE_CONFIG: prepared.baseConfigFile ?? '',
        CAP_VITE_CAP_ARGS_JSON: JSON.stringify(capArgs),
        CAP_VITE_CONFIG_LOADER: prepared.configLoader ?? '',
        CAP_VITE_ROOT: prepared.projectRoot,
      },
      stdio: 'inherit',
    },
  })
}
