import { isStageWeb } from '@proj-airi/stage-shared'

import packageJSON from '../../package.json'

// NOTE: Build-time values (~build/time, ~build/git) are not available without
// the build plugin. Using runtime fallbacks for dev.
const buildTime = new Date()
const abbreviatedSha = 'dev'
const branch = 'dev'

export function useBuildInfo() {
  const version = packageJSON.version ?? 'dev'

  return {
    version: isStageWeb() ? `${version} (${abbreviatedSha})` : version,
    commit: abbreviatedSha,
    branch,
    builtOn: buildTime.toISOString(),
  }
}
