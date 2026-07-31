import type { Plugin } from 'vite'

import process from 'node:process'

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { errorMessageFrom } from '@moeru/std'

/**
 * This package's root, resolved from this module's own URL rather than
 * `process.cwd()`: stage-web, stage-pocket, and stage-tamagotchi each run this
 * plugin from their own app directory, so a cwd-relative path would name three
 * different files. The two `..` segments walk `src/vite` back up to the root.
 */
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Zero-config developer drop-in: `packages/stage-ui-live2d/.cubism2/live2d.min.js`. */
const dropInCorePath = resolve(packageRoot, '.cubism2', 'live2d.min.js')

/** Download cache, kept out of the drop-in path so a developer's own copy is never overwritten. */
const defaultCacheDir = resolve(packageRoot, '.cubism2', 'cache')

/**
 * Where the core is published, relative to the app's base URL.
 *
 * NOTICE:
 * Deliberately has no leading slash. The consumer assigns this to `script.src`
 * after joining it to `import.meta.env.BASE_URL`, and a root-anchored path would
 * survive that join unchanged — see {@link file://./../utils/live2d-runtime.ts}.
 *
 * That breaks packaged stage-tamagotchi, whose renderer builds with `base: './'`
 * and loads over `file://` (`apps/stage-tamagotchi/src/main/libs/electron/location.ts`
 * returns `{ file }` outside dev). There, `/assets/js/live2d.min.js` resolves
 * against the file-system root instead of the renderer directory the asset was
 * emitted into. Vite rewrites the same path when it appears in `index.html`,
 * because that is an asset reference it can see; a define string is not.
 */
const coreAssetPath = 'assets/js/live2d.min.js'

/**
 * The only fetchable copy of the Cubism 2.1 core.
 *
 * Live2D removed every official Cubism 2.1 SDK download on 2019-09-04
 * (`https://help.live2d.com/en/other/other_20/`), and the core has never been
 * published to npm, so there is no dependency to declare. `pixi-live2d-display`
 * points its own users at this community mirror for the same reason — see
 * `node_modules/pixi-live2d-display/README.md`, "Cubism Core".
 *
 * Pinned to the commit that last touched the file (2016-08-05) because a bare
 * `cdn.jsdelivr.net/gh/user/repo` path tracks a mutable default branch. The
 * digest is verified on every use, so the bytes are fixed even if the mirror,
 * the CDN, or DNS is not.
 */
const mirroredCore = {
  url: 'https://cdn.jsdelivr.net/gh/dylanNew/live2d@fd9fd400845e9a00bb194fdac0b6635c753a1e8a/webgl/Live2D/lib/live2d.min.js',
  sha256: 'e4ea1f18bdd44b65394ffd5a1bab16982e88757d45134d1bd0737c8a6b3ddd08',
} as const

/** The core bytes a build will publish, once a source has won the precedence. */
interface CoreCandidate {
  /** Where the bytes came from — a filesystem path or a URL — for messages only. */
  origin: string
  source: Buffer
  /**
   * Whether these bytes were already checked against a digest this plugin owns.
   *
   * True only for the downloaded core, which carries its own pin. A locally
   * supplied core is unverified until the caller pins it, which is what the
   * "unpinned core" warning is about.
   */
  verified: boolean
}

/** Outcome of the resolution precedence, plus anything the build should be told about. */
interface CoreResolution {
  /** `undefined` when no source produced usable bytes. */
  core?: CoreCandidate
  /** Configured-but-unusable states, replayed by both `config()` and `buildStart`. */
  warnings: string[]
}

/**
 * Picks the local core to use and reports the states a developer would want to hear about.
 *
 * Every candidate must exist on disk to win, so a stale path in a vite config or
 * a CI environment cannot shadow a working lower-priority source, and a checkout
 * with no core at all resolves to nothing instead of failing to read a file.
 */
function resolveLocalCore(explicitPath: string | undefined): CoreResolution {
  const candidates = [
    // Highest priority: an explicit vite config is the most specific statement of
    // intent, so it outranks whatever the ambient environment happens to carry.
    { origin: 'options.sourcePath', path: explicitPath },
    // Release and CI provisioning: injects the maintainer-approved core without
    // editing any app's vite config. Below the explicit option so a developer can
    // override an inherited environment locally.
    { origin: 'AIRI_CUBISM2_CORE_PATH', path: process.env.AIRI_CUBISM2_CORE_PATH },
    // Lowest priority among local sources, and the only candidate whose absence is
    // normal: a checkout without this file falls through to the download.
    { origin: 'the .cubism2 drop-in', path: dropInCorePath },
  ]

  const warnings: string[] = []
  for (const candidate of candidates) {
    if (!candidate.path)
      continue

    const absolutePath = resolve(candidate.path)
    if (existsSync(absolutePath))
      return { core: { origin: absolutePath, source: readFileSync(absolutePath), verified: false }, warnings }

    // A configured path that is not on disk is always a mistake, but it must not
    // fail the build: dropping to the next candidate keeps Cubism 3+ working. The
    // drop-in is exempt because "no file there" is its normal, expected state.
    if (candidate.path !== dropInCorePath)
      warnings.push(`Cubism 2 core configured through ${candidate.origin} was not found at "${absolutePath}". Continuing without it.`)
  }

  return { warnings }
}

/**
 * Fetches the pinned core, once per machine, and caches it for later builds.
 *
 * Nothing here can break a build. A dead mirror, an offline runner, bytes that
 * fail the digest, and an unwritable cache all degrade to "no core" or to an
 * uncached success — the same states a checkout had before this step existed,
 * where Cubism 3+ keeps working and Cubism 2 archives are rejected during
 * validation with an actionable message.
 *
 * Downloaded bytes are never used unverified. That is why an overridden URL
 * without a digest is skipped rather than trusted: the core is executed as a
 * `<script>` in every app, so an unpinned remote source would amount to
 * arbitrary code execution.
 */
async function downloadCore(url: string, expectedSha256: string | undefined, cacheDir: string): Promise<CoreResolution> {
  if (!expectedSha256)
    return { warnings: [`Cubism 2 core download from "${url}" was skipped because no checksum is configured for it. Set options.downloadSha256 or AIRI_CUBISM2_CORE_URL_SHA256; a downloaded core is never used unverified.`] }

  const cachePath = join(cacheDir, 'live2d.min.js')
  const expectedDigest = expectedSha256.toLowerCase()

  // A cache entry left by another URL, a half-written file, or a tampered one
  // all fail this check and are simply re-fetched, so the cache needs no key
  // beyond the digest it is validated against.
  if (existsSync(cachePath)) {
    const cached = readFileSync(cachePath)
    if (createHash('sha256').update(cached).digest('hex') === expectedDigest)
      return { core: { origin: cachePath, source: cached, verified: true }, warnings: [] }
  }

  let source: Buffer
  try {
    const response = await fetch(url)
    if (!response.ok)
      return { warnings: [`Cubism 2 core download from "${url}" failed with HTTP ${response.status} ${response.statusText}. Continuing without Cubism 2 support.`] }

    source = Buffer.from(await response.arrayBuffer())
  }
  catch (error) {
    // Offline clones and locked-down CI runners land here, and neither is a
    // reason to fail a build that only wants Cubism 3+.
    return { warnings: [`Cubism 2 core download from "${url}" failed: ${errorMessageFrom(error) ?? 'unknown error'}. Continuing without Cubism 2 support.`] }
  }

  const actualSha256 = createHash('sha256').update(source).digest('hex')
  if (actualSha256 !== expectedDigest)
    return { warnings: [`Cubism 2 core downloaded from "${url}" does not match its pinned checksum. Expected ${expectedDigest}, received ${actualSha256}. The file was discarded and not cached; continuing without Cubism 2 support.`] }

  const warnings: string[] = []
  try {
    await mkdir(cacheDir, { recursive: true })

    // NOTICE:
    // The three apps share this cache directory and CI builds them in parallel,
    // so two processes can reach this line at once. Writing to a pid-scoped
    // temporary file and renaming keeps a reader from ever observing a
    // partially written core, which would otherwise surface as a checksum
    // mismatch or a truncated script in an unrelated build.
    const temporaryPath = `${cachePath}.${process.pid}.tmp`
    await writeFile(temporaryPath, source)
    await rename(temporaryPath, cachePath)
  }
  catch (error) {
    // The bytes are already verified and held in memory, so a read-only or
    // contended cache directory costs this build a download next time and
    // nothing else. Failing here would turn a caching detail into a build break.
    warnings.push(`Cubism 2 core downloaded from "${url}" could not be cached at "${cachePath}": ${errorMessageFrom(error) ?? 'unknown error'}. It will be downloaded again on the next build.`)
  }

  return { core: { origin: url, source, verified: true }, warnings }
}

export interface Cubism2CoreOptions {
  /**
   * Filesystem path to a maintainer-approved Cubism 2.1 Web core.
   *
   * Wins over `AIRI_CUBISM2_CORE_PATH`, over the `.cubism2` drop-in, and over
   * the download. A path that does not exist is skipped with a warning rather
   * than an error.
   *
   * @default process.env.AIRI_CUBISM2_CORE_PATH, then `packages/stage-ui-live2d/.cubism2/live2d.min.js`
   */
  sourcePath?: string
  /**
   * Lowercase or uppercase hexadecimal SHA-256 of the resolved core.
   *
   * Optional, because the downloaded core carries its own pin and a local
   * drop-in is a developer convenience. When set, the resolved bytes must match
   * it, and resolving no core at all becomes an error instead of a silent
   * Cubism 3+ build.
   *
   * @default process.env.AIRI_CUBISM2_CORE_SHA256
   */
  sha256?: string
  /**
   * Where to fetch the core when no local copy resolves, or `false` to never
   * touch the network.
   *
   * Overriding this to anything other than the built-in mirror also requires
   * {@link Cubism2CoreOptions.downloadSha256}, since downloaded bytes are never
   * executed unverified.
   *
   * @default process.env.AIRI_CUBISM2_CORE_URL, then the pinned community mirror
   */
  downloadUrl?: string | false
  /**
   * Hexadecimal SHA-256 the download must match.
   *
   * Defaults to the pin for the built-in mirror only; a custom URL has no known
   * digest, so it must supply one or the download is skipped.
   *
   * @default process.env.AIRI_CUBISM2_CORE_URL_SHA256, then the built-in mirror's digest
   */
  downloadSha256?: string
  /**
   * Directory for the downloaded core.
   *
   * Shared across the three apps so one machine downloads once. Kept separate
   * from the `.cubism2` drop-in so a developer's own licensed copy is never
   * overwritten by a cache write.
   *
   * @default `packages/stage-ui-live2d/.cubism2/cache`
   */
  cacheDir?: string
}

/**
 * Serves and emits the Cubism 2 Web core, which Live2D discontinued in 2019.
 *
 * AIRI does not redistribute the core; this plugin publishes a copy that either
 * already exists on the building machine or is fetched at build time from the
 * pinned mirror described on {@link mirroredCore} — the same shape as
 * `DownloadLive2DSDK`, which fetches the Cubism 5 core, and the sample model
 * downloads, none of which are committed either.
 *
 * Resolution order is `options.sourcePath`, `AIRI_CUBISM2_CORE_PATH`, the
 * gitignored `packages/stage-ui-live2d/.cubism2/live2d.min.js` drop-in, then the
 * download. A local copy always wins, so the network is only reached by a
 * checkout that has none. If every source fails — including an offline runner —
 * `__AIRI_CUBISM2_CORE_PATH__` stays `null` and the build keeps its Cubism 3+
 * only behaviour, so legacy models fail validation with a warning instead of at
 * runtime.
 *
 * A resolved core is served by the dev server and emitted by production builds
 * at {@link coreAssetPath}, which the define reports verbatim.
 */
export function Cubism2Core(options: Cubism2CoreOptions = {}): Plugin {
  // Owned by `config()`, which Vite always runs before `configureServer` and
  // `buildStart`; those hooks only ever publish bytes this hook already verified.
  let source: Buffer | undefined
  let warnings: string[] = []

  return {
    name: 'proj-airi:cubism2-core',
    enforce: 'pre',
    async config() {
      const expectedSha256 = options.sha256 ?? process.env.AIRI_CUBISM2_CORE_SHA256

      let resolution = resolveLocalCore(options.sourcePath)
      if (!resolution.core) {
        const downloadUrl = options.downloadUrl ?? process.env.AIRI_CUBISM2_CORE_URL ?? mirroredCore.url
        if (downloadUrl) {
          // The built-in digest describes the built-in mirror and nothing else,
          // so a redirected URL has to bring its own; `downloadCore` refuses to
          // fetch without one.
          const builtInSha256 = downloadUrl === mirroredCore.url ? mirroredCore.sha256 : undefined
          const downloadSha256 = options.downloadSha256 ?? process.env.AIRI_CUBISM2_CORE_URL_SHA256 ?? builtInSha256

          const downloaded = await downloadCore(downloadUrl, downloadSha256, options.cacheDir ?? defaultCacheDir)
          resolution = { ...downloaded, warnings: [...resolution.warnings, ...downloaded.warnings] }
        }
      }

      warnings = resolution.warnings

      if (!resolution.core) {
        // A pinned digest with nothing to verify is a misconfiguration, not a
        // request for a Cubism 3+ build: degrading quietly here would ship a
        // release that silently dropped legacy model support.
        if (expectedSha256)
          throw new Error(`A Cubism 2 core checksum is configured but no core file was found. Pass options.sourcePath, set AIRI_CUBISM2_CORE_PATH, or place the core at "${dropInCorePath}"; unset the checksum to build without Cubism 2 support.`)

        for (const warning of warnings)
          this.warn(warning)

        return {
          define: {
            __AIRI_CUBISM2_CORE_PATH__: 'null',
          },
        }
      }

      source = resolution.core.source

      if (expectedSha256) {
        const actualSha256 = createHash('sha256').update(source).digest('hex')
        if (actualSha256 !== expectedSha256.toLowerCase())
          throw new Error(`Cubism 2 core checksum mismatch for "${resolution.core.origin}". Expected ${expectedSha256}, received ${actualSha256}.`)
      }
      else if (!resolution.core.verified) {
        // The local drop-in flow: allowed so Cubism 2 needs no setup during
        // development, but every build that carries an unverified proprietary
        // core has to say so, because nothing downstream can tell afterwards.
        // The downloaded core is exempt; it was checked against its own pin.
        warnings.push(`Cubism 2 core loaded from "${resolution.core.origin}" without a checksum. Set AIRI_CUBISM2_CORE_SHA256 (or the sha256 option) before shipping a build that bundles it.`)
      }

      for (const warning of warnings)
        this.warn(warning)

      return {
        define: {
          __AIRI_CUBISM2_CORE_PATH__: JSON.stringify(coreAssetPath),
        },
      }
    },
    configureServer(server) {
      if (!source)
        return

      // Connect mounts on a root-anchored prefix, and Vite has already stripped
      // any configured base from `req.url` by the time user middlewares run.
      server.middlewares.use(`/${coreAssetPath}`, (_request, response) => {
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
        // Must stay the path the define reports: the consumer resolves that
        // string against the app base to find exactly this file.
        this.emitFile({
          type: 'asset',
          fileName: coreAssetPath,
          source,
        })
      }
    },
  }
}
