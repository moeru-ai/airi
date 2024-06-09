import { unified } from 'unified'
import RemarkRehype from 'remark-rehype'
import RemarkParse from 'remark-parse'
import RehypeStringify from 'rehype-stringify'

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
