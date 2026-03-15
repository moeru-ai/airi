import type { Plugin, ResolvedConfig } from 'vite'
import type { SiteConfig } from 'vitepress'

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'

import matter from 'gray-matter'

import { glob } from 'tinyglobby'

function fromAtAssets(url: string): string {
  const reg = /^@assets\(('\S+')|("\S+")|(\S+)\)$/
  if (reg.test(url)) {
    const res = url
      .trim()
      .replace(reg, '$1')
      .replace(/^\(/, '')
      .replace(/\)$/, '')
      .replace(/^'/, '')
      .replace(/'$/, '')
      .replace(/^"/, '')
      .replace(/"$/, '')

    return res
  }

  return url
}

interface VitePressConfig extends ResolvedConfig {
  vitepress: SiteConfig
}

function recursivelyFindAtAssets(propertyMaybeObjectOrScalar: unknown, fn: (value: string) => string | undefined) {
  if (typeof propertyMaybeObjectOrScalar === 'string') {
    // eslint-disable-next-line regexp/no-unused-capturing-group
    if (/^@assets\(('\S+')|("\S+")|(\S+)\)$/.test(propertyMaybeObjectOrScalar)) {
      // If the string matches the @assets(...) pattern, we replace it with the result of the function
      const match = fromAtAssets(propertyMaybeObjectOrScalar)
      const modified = fn(match)
      if (modified == null) {
        return propertyMaybeObjectOrScalar
      }

      return modified
    }

    return
  }
  if (Array.isArray(propertyMaybeObjectOrScalar)) {
    const array = propertyMaybeObjectOrScalar as unknown[]
    for (let i = 0; i < array.length; i++) {
      const value = array[i]
      recursivelyFindAtAssets(value, fn)
    }

    return
  }
  if (typeof propertyMaybeObjectOrScalar === 'object') {
    const propertyObject = propertyMaybeObjectOrScalar as Record<string, unknown>
    for (const key in propertyObject) {
      const value = propertyObject[key]
      recursivelyFindAtAssets(value, fn)
    }
  }
}

function withoutBase(url?: string, base?: string): string | undefined {
  if (!url) {
    return url
  }

  if (!base?.startsWith('/')) {
    base = `/${base}`
  }
  if (!base?.endsWith('/')) {
    base += '/'
  }

  if (url.startsWith(`${base}`) && base) {
    if (url.endsWith('/')) {
      return url.slice(base.length)
    }
    else {
      return `/${url.slice(base.length)}`
    }
  }

  return url
}

export function frontmatterAssets(): Plugin {
  let resolvedConfig: VitePressConfig | undefined
  const mAssetAbsoluteUrlMetadata = new Map<string, { url: string, builtUrl?: string, hash?: string }>()
  const mapAssetBuiltUrlAssetAbsoluteUrl = new Map<string, string>()

  async function fileToUrl(file: string) {
    if (!file) {
      return {
        url: file,
      }
    }

    const parsed = parse(file)
    const hash = createHash('sha256')
      .update(await readFile(file))
      .digest('hex')
      .slice(0, 8)

    return {
      hash,
      url: `/assets/${parsed.name}.${hash}${parsed.ext}`,
    }
  }

  return {
    name: '@proj-airi/docs:vite-plugin-frontmatter-assets',
    enforce: 'pre',
    async configResolved(config) {
      resolvedConfig = config as VitePressConfig

      const markdownFiles = await glob('**/*.md', { ignore: ['**/node_modules/**'], cwd: resolvedConfig?.vitepress.srcDir || '', absolute: true })
      for (const file of markdownFiles) {
        const res = (await readFile(file))
        const { data } = matter(res.toString('utf-8'))
        if (Object.keys(data).length === 0) {
          continue
        }

        recursivelyFindAtAssets(data, (matched) => {
          const assetPath = fromAtAssets(matched)
          let absoluteAssetPath: string
          if (assetPath.startsWith('/')) {
            absoluteAssetPath = join(resolvedConfig?.vitepress.srcDir || '', assetPath)
          }
          else {
            absoluteAssetPath = join(dirname(file), assetPath)
          }

          mAssetAbsoluteUrlMetadata.set(absoluteAssetPath, { url: file, builtUrl: file, hash: '' })
          return undefined
        })
      }

      for (const [key, value] of mAssetAbsoluteUrlMetadata) {
        const { url, hash } = await fileToUrl(key)
        mapAssetBuiltUrlAssetAbsoluteUrl.set(url, key)
        mAssetAbsoluteUrlMetadata.set(key, { url: value.url, builtUrl: url, hash })
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requesting = withoutBase(req.url, resolvedConfig?.base)
        if (!requesting || !mapAssetBuiltUrlAssetAbsoluteUrl.has(requesting)) {
          return next()
        }

        const filePath = mapAssetBuiltUrlAssetAbsoluteUrl.get(requesting)
        if (!filePath) {
          return next()
        }

        const ext = parse(filePath).ext.slice(1)
        const fileContent = await readFile(filePath)

        res.writeHead(200, {
          'Content-Type': ext === 'svg' ? 'image/svg+xml' : `image/${ext}`,
          'Content-Length': fileContent.length,
          'Cache-Control': 'public, max-age=31536000, immutable',
        })
        res.end(fileContent)
        res.end()
      })
    },
    async writeBundle() {
      for (const [builtUrl, absoluteUrl] of mapAssetBuiltUrlAssetAbsoluteUrl.entries()) {
        const content = await this.fs.readFile(absoluteUrl)
        await this.fs.writeFile(join(resolvedConfig!.vitepress.outDir!, builtUrl), content)
      }
    },
  }
}
