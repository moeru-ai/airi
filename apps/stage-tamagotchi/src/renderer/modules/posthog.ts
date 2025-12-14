import buildTime from '~build/time'
import posthog from 'posthog-js'

import { abbreviatedSha } from '~build/git'
import { version } from '~build/package'

posthog.init('phc_rljw376z5gt6vXJlc3sTr7hFbXodciY9THEQXIRnW53', {
  api_host: 'https://us.i.posthog.com',
  person_profiles: 'identified_only', // or 'always' to create profiles for anonymous users as well
})

posthog.register({
  app_version: version ?? 'dev',
  app_commit: abbreviatedSha,
  app_build_time: buildTime,
})
