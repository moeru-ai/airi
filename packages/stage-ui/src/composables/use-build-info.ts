import buildTime from '~build/time'

import { isStageWeb } from '@proj-airi/stage-shared'
import { abbreviatedSha, branch } from '~build/git'

import packageJSON from '../../package.json'

export function useBuildInfo() {
  const version = packageJSON.version ?? 'dev'

  return {
    branch,
    builtOn: buildTime.toISOString(),
    commit: abbreviatedSha,
    version: isStageWeb() ? `${version} (${abbreviatedSha})` : version,
  }
}
