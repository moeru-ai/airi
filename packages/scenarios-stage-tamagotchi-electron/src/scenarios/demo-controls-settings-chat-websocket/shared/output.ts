import { mkdir, rm } from 'node:fs/promises'

import { errorMessageFrom } from '@moeru/std'

import { scenarioRawOutputDir } from './constants'

export async function resetScenarioOutputDirectories() {
  await rm(scenarioRawOutputDir, { recursive: true, force: true })
  await mkdir(scenarioRawOutputDir, { recursive: true })
}

export function formatStepFailure(sectionId: string, stepId: string, error: unknown): Error {
  const message = errorMessageFrom(error) ?? 'Unknown screenshot automation error'

  return new Error(`[${sectionId}/${stepId}] ${message}`, {
    cause: error instanceof Error ? error : undefined,
  })
}
