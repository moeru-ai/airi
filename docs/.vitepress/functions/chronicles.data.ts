import type { SiteConfig } from 'vitepress'

import { createContentLoader } from 'vitepress'

import { formatDate } from '../utils/utils'

const config: SiteConfig = (globalThis as any).VITEPRESS_CONFIG

interface ChronicleEntry {
  date: ReturnType<typeof formatDate>
  excerpt: string | undefined
  frontmatter?: Record<string, any>
  lang: string
  title: string
  url: string
  urlWithoutLang: string
}

declare const data: ChronicleEntry[]
export { data }

export default createContentLoader('**/chronicles/**/*.md', {
  excerpt: true,
  includeSrc: true,
  render: true,
  transform(raw): ChronicleEntry[] {
    return raw
      .map(({ excerpt, frontmatter, url }) => {
        const foundLanguage = Object.values(config.userConfig.locales!).find((locale) => {
          let normalizedLanguagePrefix = locale.lang || 'en'
          if (!normalizedLanguagePrefix.startsWith('/')) {
            normalizedLanguagePrefix = `/${normalizedLanguagePrefix}`
          }

          return url.startsWith(normalizedLanguagePrefix)
        })

        return {
          date: formatDate(frontmatter.date),
          excerpt,
          frontmatter,
          lang: foundLanguage?.lang || 'en',
          title: frontmatter.title,
          url,
          urlWithoutLang: url.replace(`/${foundLanguage?.lang || 'en'}`, ''),
        }
      })
      .sort((a, b) => b.date.time - a.date.time)
  },
})
