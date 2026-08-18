import buildTime from '~build/time'

import { isStageWeb } from '@proj-airi/stage-shared'
import { abbreviatedSha, branch } from '~build/git'

import packageJSON from '../../package.json'

export function useBuildInfo() {
  const version = packageJSON.version ?? 'dev'

  return {
    version: isStageWeb() ? `${version} (${abbreviatedSha})` : version,
    commit: abbreviatedSha,
    branch,
    builtOn: buildTime.toISOString(),
  }
}
