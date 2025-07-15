import { createContentLoader } from 'vitepress'

interface ChronicleEntry {
  title: string
  url: string
  date: {
    time: number
    string: string
  }
  excerpt: string | undefined
  frontmatter?: Record<string, any>
}

declare const data: ChronicleEntry[]
export { data }

export default createContentLoader('**/chronicles/**/*.md', {
  includeSrc: true,
  render: true,
  excerpt: true,
  transform(raw): ChronicleEntry[] {
    return raw
      .map(({ url, frontmatter, excerpt }) => ({
        title: frontmatter.title,
        url,
        excerpt,
        date: formatDate(frontmatter.date),
        frontmatter,
      }))
      .sort((a, b) => b.date.time - a.date.time)
  },
})

function formatDate(raw: string): ChronicleEntry['date'] {
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
