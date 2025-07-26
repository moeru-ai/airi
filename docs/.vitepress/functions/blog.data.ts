import type { SiteConfig } from 'vitepress'

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { parse } from 'node:path'
import { env } from 'node:process'

import { dirname, join } from 'pathe'
import { createContentLoader } from 'vitepress'

import { formatDate } from './utils'

const config: SiteConfig = (globalThis as any).VITEPRESS_CONFIG
const base = config.userConfig.base || env.BASE_URL || '/'

interface Post {
  title: string
  url: string
  urlWithoutLang: string
  lang: string
  date: ReturnType<typeof formatDate>
  excerpt: string | undefined
  frontmatter?: Record<string, any>
}

declare const data: Post[]
export { data }

function cwdFromUrl(url: string): string {
  if (url.endsWith('/')) {
    return url
  }

  return dirname(url)
}

function fromAtAssets(url: string): string {
  const reg = /^@assets\(('\S+')|("\S+")|(\S+)\)$/
  if (reg.test(url)) {
    const res = url
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

function withBase(url?: string, base?: string, cwd?: string) {
  if (!url) {
    return url
  }

  if (url.startsWith('/') && base) {
    return join(base, url)
  }
  if (!url.startsWith('/') && base && cwd) {
    return join(base, cwd, url)
  }

  return url
}

export default createContentLoader('**/blog/**/*.md', {
  includeSrc: true,
  render: true,
  excerpt: true,
  async transform(raw): Promise<Post[]> {
    return (await Promise.all(raw
      .map(async ({ url, frontmatter, excerpt }) => {
        const foundLanguage = Object.values(config.userConfig.locales!).find((locale) => {
          let normalizedLanguagePrefix = locale.lang || 'en'
          if (!normalizedLanguagePrefix.startsWith('/')) {
            normalizedLanguagePrefix = `/${normalizedLanguagePrefix}`
          }

          return url.startsWith(normalizedLanguagePrefix)
        })

        async function fileToUrl(file: string | undefined) {
          if (config.vite?.build)
            return file
          if (!file)
            return file

          const parsed = parse(file)
          const hash = createHash('sha256')
            .update(await readFile(join(config.srcDir, file)))
            .digest('hex')
            .slice(0, 8)

          return `/assets/${parsed.name}.${hash}${parsed.ext}`
        }

        const previewCoverLight = await fileToUrl(withBase(fromAtAssets(frontmatter['preview-cover']?.light), base, cwdFromUrl(url)))
        const previewCoverDark = await fileToUrl(withBase(fromAtAssets(frontmatter['preview-cover']?.dark), base, cwdFromUrl(url)))

        const res = {
          title: frontmatter.title,
          url,
          urlWithoutLang: url.replace(`/${foundLanguage?.lang || 'en'}`, ''),
          excerpt,
          date: formatDate(frontmatter.date),
          lang: foundLanguage?.lang || 'en',
          frontmatter: {
            ...frontmatter,
            'preview-cover': {
              light: previewCoverLight,
              dark: previewCoverDark,
            },
          },
        }

        return res
      })))
      .sort((a, b) => b.date.time - a.date.time)
  },
})
