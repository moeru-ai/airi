import type { Plugin } from 'vite'

import process from 'node:process'

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Zero-config developer drop-in: `packages/stage-ui-live2d/.cubism2/live2d.min.js`.
 *
 * Resolved from this module's own URL rather than `process.cwd()`, because
 * stage-web, stage-pocket, and stage-tamagotchi each run this plugin from their
 * own app directory; a cwd-relative path would name three different files. The
 * two `..` segments walk `src/vite` back up to this package's root.
 */
const dropInCorePath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.cubism2', 'live2d.min.js')

/** Outcome of the resolution precedence, plus anything the build should be told about. */
interface CoreResolution {
  /** Absolute path of the winning candidate; `undefined` when no core is available. */
  path?: string
  /** Configured-but-unusable states, replayed by both `config()` and `buildStart`. */
  warnings: string[]
}

/**
 * Picks the core to use and reports the states a developer would want to hear about.
 *
 * Every candidate must exist on disk to win, so a stale path in a vite config or
 * a CI environment cannot shadow a working lower-priority source, and a checkout
 * with no core at all resolves to nothing instead of failing to read a file.
 */
function resolveCorePath(explicitPath: string | undefined): CoreResolution {
  const candidates = [
    // Highest priority: an explicit vite config is the most specific statement of
    // intent, so it outranks whatever the ambient environment happens to carry.
    { origin: 'options.sourcePath', path: explicitPath },
    // Release and CI provisioning: injects the maintainer-approved core without
    // editing any app's vite config. Below the explicit option so a developer can
    // override an inherited environment locally.
    { origin: 'AIRI_CUBISM2_CORE_PATH', path: process.env.AIRI_CUBISM2_CORE_PATH },
    // Lowest priority, and the only candidate whose absence is normal: a checkout
    // without this file must keep producing today's Cubism 3+ only build.
    { origin: 'the .cubism2 drop-in', path: dropInCorePath },
  ]

  const warnings: string[] = []
  for (const candidate of candidates) {
    if (!candidate.path)
      continue

    const absolutePath = resolve(candidate.path)
    if (existsSync(absolutePath))
      return { path: absolutePath, warnings }

    // A configured path that is not on disk is always a mistake, but it must not
    // fail the build: dropping to the next candidate keeps Cubism 3+ working. The
    // drop-in is exempt because "no file there" is its normal, expected state.
    if (candidate.path !== dropInCorePath)
      warnings.push(`Cubism 2 core configured through ${candidate.origin} was not found at "${absolutePath}". Continuing without it.`)
  }

  return { warnings }
}

export interface Cubism2CoreOptions {
  /**
   * Filesystem path to a maintainer-approved Cubism 2.1 Web core.
   *
   * Wins over `AIRI_CUBISM2_CORE_PATH` and over the `.cubism2` drop-in. A path
   * that does not exist is skipped with a warning rather than an error.
   *
   * @default process.env.AIRI_CUBISM2_CORE_PATH, then `packages/stage-ui-live2d/.cubism2/live2d.min.js`
   */
  sourcePath?: string
  /**
   * Lowercase or uppercase hexadecimal SHA-256 of the resolved core.
   *
   * Optional while developing against a local drop-in, required for anything
   * shipped. When set, the resolved bytes must match it, and resolving no core
   * at all becomes an error instead of a silent Cubism 3+ build.
   *
   * @default process.env.AIRI_CUBISM2_CORE_SHA256
   */
  sha256?: string
}

/**
 * Serves and emits a maintainer-supplied Cubism 2 Web core.
 *
 * AIRI never downloads or redistributes the proprietary core; this plugin only
 * publishes a copy that already exists on the building machine. It is resolved
 * from `options.sourcePath`, then `AIRI_CUBISM2_CORE_PATH`, then the gitignored
 * `packages/stage-ui-live2d/.cubism2/live2d.min.js` drop-in. With none of them
 * present, `__AIRI_CUBISM2_CORE_URL__` stays `null` and the build keeps its
 * Cubism 3+ only behaviour, so legacy models fail validation with a warning
 * instead of at runtime.
 *
 * A resolved core is served from `/assets/js/live2d.min.js` by the dev server
 * and emitted to `assets/js/live2d.min.js` by production builds.
 */
export function Cubism2Core(options: Cubism2CoreOptions = {}): Plugin {
  const publicPath = '/assets/js/live2d.min.js'

  // Owned by `config()`, which Vite always runs before `configureServer` and
  // `buildStart`; those hooks only ever publish bytes this hook already verified.
  let source: ReturnType<typeof readFileSync> | undefined
  let warnings: string[] = []

  return {
    name: 'proj-airi:cubism2-core',
    enforce: 'pre',
    config() {
      const expectedSha256 = options.sha256 ?? process.env.AIRI_CUBISM2_CORE_SHA256
      const resolution = resolveCorePath(options.sourcePath)
      warnings = resolution.warnings

      if (!resolution.path) {
        // A pinned digest with nothing to verify is a misconfiguration, not a
        // request for a Cubism 3+ build: degrading quietly here would ship a
        // release that silently dropped legacy model support.
        if (expectedSha256)
          throw new Error(`A Cubism 2 core checksum is configured but no core file was found. Pass options.sourcePath, set AIRI_CUBISM2_CORE_PATH, or place the core at "${dropInCorePath}"; unset the checksum to build without Cubism 2 support.`)

        for (const warning of warnings)
          this.warn(warning)

        return {
          define: {
            __AIRI_CUBISM2_CORE_URL__: 'null',
          },
        }
      }

      source = readFileSync(resolution.path)

      if (expectedSha256) {
        const actualSha256 = createHash('sha256').update(source).digest('hex')
        if (actualSha256 !== expectedSha256.toLowerCase())
          throw new Error(`Cubism 2 core checksum mismatch for "${resolution.path}". Expected ${expectedSha256}, received ${actualSha256}.`)
      }
      else {
        // The local drop-in flow: allowed so Cubism 2 needs no setup during
        // development, but every build that carries an unverified proprietary
        // core has to say so, because nothing downstream can tell afterwards.
        warnings.push(`Cubism 2 core loaded from "${resolution.path}" without a checksum. Set AIRI_CUBISM2_CORE_SHA256 (or the sha256 option) before shipping a build that bundles it.`)
      }

      for (const warning of warnings)
        this.warn(warning)

      return {
        define: {
          __AIRI_CUBISM2_CORE_URL__: JSON.stringify(publicPath),
        },
      }
    },
    configureServer(server) {
      if (!source)
        return

      server.middlewares.use(publicPath, (_request, response) => {
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        response.end(source)
      })
    },
    buildStart() {
      // Repeated from `config()`: that hook logs through the config-stage
      // logger, which sits above the bundle log where CI annotations and build
      // tooling collect plugin warnings.
      for (const warning of warnings)
        this.warn(warning)

      // `buildStart` runs in dev too, where Rollup disallows `emitFile`
      // ("context method emitFile() is not supported in serve mode"). The dev
      // bytes come from `configureServer`'s middleware instead, so emission is
      // a build-only concern. `watchMode` is Vite's dev flag; inverted here it
      // matches a true production build.
      if (source && !this.meta.watchMode) {
        this.emitFile({
          type: 'asset',
          fileName: 'assets/js/live2d.min.js',
          source,
        })
      }
    },
  }
}
