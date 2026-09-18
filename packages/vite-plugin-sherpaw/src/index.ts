import type { Plugin } from 'vite'

import type { SherpawModel } from './models'

import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { Download } from '@proj-airi/unplugin-fetch/vite'
import { sherpawModelPath } from '@proj-airi/vite-plugin-sherpaw/models'
import { normalizePath } from 'vite'

/** Selects models for this application. Downloads remain in a separate cache. */
export interface SherpawOptions {
  /** Only these models are bundled. An empty list clears previously bundled models. */
  models: readonly SherpawModel[]
  /** Shared download cache, resolved against the Vite root. @default '.cache' */
  cacheDir?: string
}

/**
 * Downloads selected presets to a revision-scoped cache and exposes their Vite asset URLs.
 * Build imports let URL-rewriting plugins upload the files and remove local deployment copies.
 * Development uses Vite's local asset server. Download failures stop configuration.
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
      const entries: string[] = []

      for (const [index, model] of options.models.entries()) {
        const outputPath = sherpawModelPath(model)
        const downloads = ['preload.data', 'preload.js.metadata'].map(filename => Download(
          `https://huggingface.co/${model.repository}/resolve/${model.revision}/${model.directory}/${filename}`,
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
        entries.push(`${JSON.stringify(model.id)}: { data: data${index}, metadata: metadata${index} }`)
      }
      assetModule = `${imports.join('\n')}\nexport const assets = { ${entries.join(',')} }`
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
