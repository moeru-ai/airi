import type { ElectronScenario } from './types'

import process from 'node:process'

import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface LoadedScenarioModule {
  modulePath: string
  scenario: ElectronScenario
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function isElectronScenario(value: unknown): value is ElectronScenario {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const scenario = value as Partial<ElectronScenario>
  return typeof scenario.id === 'string' && typeof scenario.run === 'function'
}

export async function loadScenarioModule(scenarioPath: string): Promise<LoadedScenarioModule> {
  const modulePath = resolve(process.cwd(), scenarioPath)

  await access(modulePath).catch(() => {
    throw new Error(`Scenario module not found at ${modulePath}`)
  })

  let moduleNamespace: { default?: unknown }

  try {
    moduleNamespace = await import(pathToFileURL(modulePath).href)
  }
  catch (error) {
    throw new Error(`Failed to load scenario module at ${modulePath}: ${getErrorMessage(error)}`)
  }

  if (!isElectronScenario(moduleNamespace.default)) {
    const exportedKeys = Object.keys(moduleNamespace).join(', ') || '(none)'
    throw new Error(
      `Scenario module at ${modulePath} must export a default scenario object with id and run(ctx). Exported keys: ${exportedKeys}`,
    )
  }

  return {
    modulePath,
    scenario: moduleNamespace.default,
  }
}
