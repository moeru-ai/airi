import type { SiteConfig } from 'vitepress'

import { env } from 'node:process'

import { dirname, join } from 'pathe'
import { createContentLoader } from 'vitepress'

const config: SiteConfig = (globalThis as any).VITEPRESS_CONFIG
const base = config.userConfig.base || env.BASE_URL || '/'

interface Post {
  title: string
  url: string
  urlWithoutLang: string
  lang: string
  date: {
    time: number
    string: string
  }
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
  transform(raw): Post[] {
    return raw
      .map(({ url, frontmatter, excerpt }) => {
        const foundLanguage = Object.values(config.userConfig.locales!).find((locale) => {
          let normalizedLanguagePrefix = locale.lang || 'en'
          if (!normalizedLanguagePrefix.startsWith('/')) {
            normalizedLanguagePrefix = `/${normalizedLanguagePrefix}`
          }

          return url.startsWith(normalizedLanguagePrefix)
        })

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
              light: withBase(frontmatter['preview-cover']?.light, base, cwdFromUrl(url)),
              dark: withBase(frontmatter['preview-cover']?.dark, base, cwdFromUrl(url)),
            },
          },
        }

        return res
      })
      .sort((a, b) => b.date.time - a.date.time)
  },
})

function formatDate(raw: string): Post['date'] {
  const date = new Date(raw)
  date.setUTCHours(12)

  return {
    time: +date,
    string: date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  }
}
