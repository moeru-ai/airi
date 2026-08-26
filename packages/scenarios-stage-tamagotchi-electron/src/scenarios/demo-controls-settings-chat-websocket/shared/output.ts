import { mkdir, rm } from 'node:fs/promises'

import { errorMessageFrom } from '@moeru/std'

import { scenarioRawOutputDir } from './constants'

export function formatStepFailure(sectionId: string, stepId: string, error: unknown): Error {
  const message = errorMessageFrom(error) ?? 'Unknown screenshot automation error'

  return new Error(`[${sectionId}/${stepId}] ${message}`, {
    cause: error instanceof Error ? error : undefined,
  })
}

export async function resetScenarioOutputDirectories() {
  await rm(scenarioRawOutputDir, { force: true, recursive: true })
  await mkdir(scenarioRawOutputDir, { recursive: true })
}
