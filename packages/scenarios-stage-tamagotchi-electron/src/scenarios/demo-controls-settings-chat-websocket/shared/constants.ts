import path from 'node:path'

import { fileURLToPath } from 'node:url'

const scenarioDirectoryPath = fileURLToPath(new URL('..', import.meta.url))
const repoRootPath = fileURLToPath(new URL('../../../../../../', import.meta.url))

export const scenarioRawOutputDir = path.join(scenarioDirectoryPath, 'assets', 'raw')
export const manualDocsAssetsDir = path.join(
  repoRootPath,
  'docs',
  'content',
  'en',
  'docs',
  'manual',
  'tamagotchi',
  'setup-and-use',
  'assets',
)
