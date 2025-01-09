import RehypeStringify from 'rehype-stringify'
import RemarkParse from 'remark-parse'
import RemarkRehype from 'remark-rehype'
import { unified } from 'unified'

export function useMarkdown() {
  const instance = unified()
    .use(RemarkParse)
    .use(RemarkRehype)
    .use(RehypeStringify)
  return {
    process: (markdown: string): string => {
      return instance
        .processSync(markdown)
        .toString()
    },
  }
}
