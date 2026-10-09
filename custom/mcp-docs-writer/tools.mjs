// Tool definitions of the docs writer. The stdio server and weknora-bridge both use them.
// They only create new Markdown files in one folder. They never overwrite, edit, or delete a file.

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const MAX_CONTENT_CHARS = 200_000
const MAX_TITLE_CHARS = 120
const MAX_SLUG_CHARS = 60
const MAX_SUFFIX = 99
const MAX_LISTED_DOCS = 100

/** Makes an ASCII file name part from a title, for example "Tổng hợp ADR" → "tong-hop-adr". */
function slugify(title) {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_CHARS)
  return slug || 'tai-lieu'
}

function frontMatter(title, sources, createdAt) {
  const lines = ['---', `title: ${JSON.stringify(title)}`, `created: ${createdAt}`, 'author: Mai (AIRI)']
  if (sources.length > 0)
    lines.push('sources:', ...sources.map(source => `  - ${JSON.stringify(source)}`))
  return `${lines.join('\n')}\n---\n\n`
}

/** Opens a new file with the `wx` flag, so an existing file is never replaced. */
async function writeNewFile(docsDir, base, text) {
  for (let suffix = 1; suffix <= MAX_SUFFIX; suffix++) {
    const name = suffix === 1 ? `${base}.md` : `${base}-${suffix}.md`
    try {
      await writeFile(join(docsDir, name), text, { flag: 'wx' })
      return name
    }
    catch (error) {
      if (error.code !== 'EEXIST')
        throw error
    }
  }
  throw new Error('Có quá nhiều tài liệu trùng tên trong ngày. Hãy đổi tiêu đề.')
}

/** Creates the docs tools for one output folder. */
export function createDocsWriterTools(docsDir) {
  return {
    write_doc: {
      description: `Lưu một tài liệu Markdown mới vào ${docsDir}. Luôn tạo file mới, không sửa file cũ. Ghi nguồn tham khảo vào sources.`,
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Tiêu đề tài liệu' },
          content: { type: 'string', description: 'Nội dung Markdown, không cần front-matter' },
          sources: { type: 'array', items: { type: 'string' }, description: 'Tên tài liệu hoặc đường dẫn nguồn đã dùng' },
        },
        required: ['title', 'content'],
      },
      async run({ title, content, sources = [] }) {
        const cleanTitle = String(title ?? '').trim().slice(0, MAX_TITLE_CHARS)
        if (!cleanTitle)
          throw new Error('Thiếu tiêu đề.')
        if (typeof content !== 'string' || !content.trim())
          throw new Error('Thiếu nội dung.')
        if (content.length > MAX_CONTENT_CHARS)
          throw new Error(`Nội dung dài quá ${MAX_CONTENT_CHARS} ký tự. Hãy chia thành nhiều tài liệu.`)
        const createdAt = new Date().toISOString()
        await mkdir(docsDir, { recursive: true })
        const sourceList = Array.isArray(sources) ? sources.map(String) : []
        const name = await writeNewFile(docsDir, `${createdAt.slice(0, 10)}-${slugify(cleanTitle)}`, `${frontMatter(cleanTitle, sourceList, createdAt) + content.trim()}\n`)
        return `Đã lưu: ${join(docsDir, name)}`
      },
    },
    list_docs: {
      description: 'Liệt kê các tài liệu đã lưu, mới nhất trước.',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        const names = await readdir(docsDir).catch(() => [])
        const docs = await Promise.all(names.filter(name => name.endsWith('.md')).map(async name => ({ name, mtime: (await stat(join(docsDir, name))).mtimeMs })))
        return docs.sort((a, b) => b.mtime - a.mtime).slice(0, MAX_LISTED_DOCS).map(doc => doc.name).join('\n') || '(chưa có tài liệu nào)'
      },
    },
  }
}
