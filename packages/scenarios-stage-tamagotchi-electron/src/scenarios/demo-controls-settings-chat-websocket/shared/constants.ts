import path from 'node:path'

import { fileURLToPath } from 'node:url'

const repoRootPath = fileURLToPath(new URL('../../../../../../', import.meta.url))

export const browserRawAssetsDir = path.join(
  repoRootPath,
  'packages',
  'scenarios-stage-tamagotchi-browser',
  'artifacts',
  'raw',
)
export const scenarioRawOutputDir = browserRawAssetsDir
