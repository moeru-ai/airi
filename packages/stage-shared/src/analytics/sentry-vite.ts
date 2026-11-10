import { sentryVitePlugin } from '@sentry/bundler-plugins/vite'

// NOTICE:
// Node loads this file from the Vite configs without a bundler, and Node does not resolve extensionless relative
// imports. So this file imports nothing relative and keeps its own copy of the build-time values.
// Source: `ERR_MODULE_NOT_FOUND` for `./sentry` when `apps/stage-web/vite.config.ts` loaded this file.
// Removal condition: when the Vite configs load through a bundler that resolves extensionless imports.

/** The Sentry organization of AIRI. The DSN of each project is in `./sentry`. */
const org = 'proj-airi'

/** The Sentry project slug of each AIRI client. The keys match `SENTRY_PROJECTS` in `./sentry`. */
const projectSlugs = {
  desktop: 'stage-tamagotchi',
  web: 'stage-web',
  mobile: 'stage-pocket',
} as const

/**
 * Uploads the source maps of one Vite build to the Sentry project of its app. Put it after all other plugins.
 *
 * CI release builds pass `SENTRY_AUTH_TOKEN`. Without a token, the plugin does nothing.
 */
export function sentrySourceMaps(options: {
  project: keyof typeof projectSlugs
  authToken: string | undefined
  /** Deletes the uploaded maps, for a build that must not ship them. */
  filesToDeleteAfterUpload?: string[]
}) {
  return sentryVitePlugin({
    org,
    project: projectSlugs[options.project],
    authToken: options.authToken,
    disable: !options.authToken,
    telemetry: false,
    sourcemaps: { filesToDeleteAfterUpload: options.filesToDeleteAfterUpload },
  })
}
