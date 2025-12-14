import posthog from 'posthog-js'

posthog.init('phc_rljw376z5gt6vXJlc3sTr7hFbXodciY9THEQXIRnW53', {
  api_host: 'https://us.i.posthog.com',
  person_profiles: 'identified_only', // or 'always' to create profiles for anonymous users as well
})
