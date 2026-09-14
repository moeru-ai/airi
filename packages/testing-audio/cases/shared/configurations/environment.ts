import type { AudioInputPreflightContext } from '../../../src/types'

import { resolve } from 'node:path'

import { loadEnv } from 'vite'

import { findWorkspaceRoot } from '../../../src/setup/find-workspace-root'

/** Loads Vite test-mode environment files and applies the environment of the current case. */
export async function loadCaseEnvironment(
  environment: AudioInputPreflightContext['env'],
): Promise<Record<string, string | undefined>> {
  const repositoryRoot = findWorkspaceRoot(import.meta.dirname)
  if (!repositoryRoot)
    throw new Error(`Unable to find the workspace root from ${import.meta.dirname}`)

  const repositoryEnvironment = loadEnv('test', repositoryRoot, '')
  // Shared Provider development variables live in stage-ui. These values override repository files.
  const stageUiEnvironment = loadEnv('test', resolve(repositoryRoot, 'packages/stage-ui'), '')
  // Audio case credentials belong to this package. These values override shared Provider variables.
  const testingAudioEnvironment = loadEnv('test', resolve(repositoryRoot, 'packages/testing-audio'), '')
  // The case process has the highest priority so that CI and shell values override local files.
  return { ...repositoryEnvironment, ...stageUiEnvironment, ...testingAudioEnvironment, ...environment }
}
