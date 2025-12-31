import buildTime from '~build/time'

import { abbreviatedSha, branch } from '~build/git'
import { version } from '~build/package'

export function useBuildInfo() {
  return {
    version: version ?? 'dev',
    commit: abbreviatedSha,
    branch,
    builtOn: buildTime.toISOString(),
  }
}
