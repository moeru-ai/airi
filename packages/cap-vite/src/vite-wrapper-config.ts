import process from 'node:process'

import { defineConfig, loadConfigFromFile, mergeConfig } from 'vite'

import { capVitePlugin } from './vite-plugin'

function parseCapArgs(): string[] {
  const value = process.env.CAP_VITE_CAP_ARGS_JSON
  if (!value) {
    return []
  }

  const parsed = JSON.parse(value)
  if (!Array.isArray(parsed) || parsed.some(arg => typeof arg !== 'string')) {
    throw new Error('CAP_VITE_CAP_ARGS_JSON must be a JSON string array.')
  }

  return parsed
}

function parseConfigLoader(): 'bundle' | 'native' | 'runner' | undefined {
  const value = process.env.CAP_VITE_CONFIG_LOADER
  if (value === 'bundle' || value === 'native' || value === 'runner') {
    return value
  }

  return undefined
}

export default defineConfig(async (env) => {
  const root = process.env.CAP_VITE_ROOT ?? process.cwd()
  const baseConfigFile = process.env.CAP_VITE_BASE_CONFIG || undefined
  const configLoader = parseConfigLoader()

  const loaded = await loadConfigFromFile(
    env,
    baseConfigFile,
    root,
    undefined,
    undefined,
    configLoader,
  )

  return mergeConfig(loaded?.config ?? {}, {
    plugins: [
      capVitePlugin({
        capArgs: parseCapArgs(),
      }),
    ],
  })
})
