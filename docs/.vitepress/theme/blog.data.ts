import type { SiteConfig } from 'vitepress'

import { createContentLoader } from 'vitepress'

const config: SiteConfig = (globalThis as any).VITEPRESS_CONFIG

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

        return {
          title: frontmatter.title,
          url,
          urlWithoutLang: url.replace(`/${foundLanguage?.lang || 'en'}`, ''),
          excerpt,
          date: formatDate(frontmatter.date),
          lang: foundLanguage?.lang || 'en',
          frontmatter,
        }
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
