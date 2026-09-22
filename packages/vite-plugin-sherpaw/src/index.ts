import type { SherpawModel } from '@proj-airi/sherpaw-models'
import type { Plugin } from 'vite'

import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { sherpawModelArtifactUrl, sherpawModelPath } from '@proj-airi/sherpaw-models'
import { Download } from '@proj-airi/unplugin-fetch/vite'
import { normalizePath } from 'vite'

/** Selects models for this application. Downloads remain in a separate cache. */
export interface SherpawOptions {
  /** Models exposed to the runtime. Remote models load lazily when first used. */
  models: readonly SherpawModel[]
  /** Models copied into the application build. @default [] */
  bundledModels?: readonly SherpawModel[]
  /** Shared download cache, resolved against the Vite root. @default '.cache' */
  cacheDir?: string
}

/**
 * Exposes pinned remote model URLs and optionally bundles selected models.
 * Build imports let URL-rewriting plugins upload the files and remove local deployment copies.
 * Development downloads only models listed in `bundledModels` before Vite starts.
 */
export function Sherpaw(options: SherpawOptions): Plugin {
  const moduleId = '@proj-airi/vite-plugin-sherpaw/assets'
  const resolvedModuleId = `\0${moduleId}`
  // configResolved prepares the imports before Vite loads the runtime asset catalogue.
  let assetModule: string

  return {
    name: 'airi-sherpaw-models',
    enforce: 'pre',
    apply: (_config, environment) => !environment.isPreview,
    async configResolved(config) {
      const cacheDirectory = resolve(config.root, options.cacheDir ?? '.cache')
      if (config.publicDir)
        await rm(join(config.publicDir, 'sherpaw'), { recursive: true, force: true })
      const imports: string[] = []
      const entries = new Map(options.models.map(model => [
        model.id,
        `${JSON.stringify(model.id)}: { data: ${JSON.stringify(sherpawModelArtifactUrl(model, 'preload.data'))}, metadata: ${JSON.stringify(sherpawModelArtifactUrl(model, 'preload.js.metadata'))}, source: 'remote' }`,
      ]))

      for (const [index, model] of (options.bundledModels ?? []).entries()) {
        if (!entries.has(model.id))
          throw new Error(`Bundled Sherpaw model "${model.id}" must also be listed in models.`)
        const outputPath = sherpawModelPath(model)
        const downloads = (['preload.data', 'preload.js.metadata'] as const).map(filename => Download(
          sherpawModelArtifactUrl(model, filename),
          filename,
          outputPath,
          { cacheDir: cacheDirectory, parentDir: cacheDirectory },
        ))

        // Separate Vite configResolved hooks run concurrently. Await downloads here
        // before Vite resolves the generated asset imports.
        await Promise.all(downloads.map(async (plugin) => {
          const hook = plugin.configResolved
          if (typeof hook === 'function')
            await hook.call(this, config)
          else if (hook)
            await hook.handler.call(this, config)
        }))

        // URL imports participate in Vite's renderBuiltUrl hook. no-inline keeps
        // the small metadata file on the same upload path as its model data.
        const directory = normalizePath(join(cacheDirectory, outputPath))
        imports.push(`import data${index} from ${JSON.stringify(`${directory}/preload.data?url&no-inline`)}`)
        imports.push(`import metadata${index} from ${JSON.stringify(`${directory}/preload.js.metadata?url&no-inline`)}`)
        entries.set(model.id, `${JSON.stringify(model.id)}: { data: data${index}, metadata: metadata${index}, source: 'bundled' }`)
      }
      assetModule = `${imports.join('\n')}\nexport const assets = { ${[...entries.values()].join(',')} }`
    },
    resolveId(id) {
      if (id === moduleId)
        return resolvedModuleId
    },
    load(id) {
      if (id === resolvedModuleId)
        return assetModule
    },
  }
}
