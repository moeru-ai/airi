// MCP tools for the wiki. wiki_build runs in the background through the indexer's job queue.

/* eslint-disable no-restricted-syntax -- Plain Node.js ESM needs file extensions. */
import { truncate } from '../shared/mcp-stdio.mjs'
import { ftsQuery } from './search.mjs'
import { findFolderIds } from './tools.mjs'
import { cleanDeadLinks, getPage, listPages, normalizeSlug, renderIndex, savePage } from './wiki-store.mjs'
import { createWikiBuilder, estimateCost, pendingDocuments } from './wiki.mjs'

// wiki_build asks for confirmation above this estimate (USD).
const CONFIRM_ABOVE_USD = 1
const MAX_PAGE_CHARS = 40_000
const SEARCH_LIMIT = 10
// bm25 weights per wiki_fts column (folder_id, slug, title, summary, content), like WeKnora's ranking.
const BM25_WEIGHTS = '0, 3.0, 4.0, 2.0, 1.0'

function folderOf(db, folder) {
  const ids = findFolderIds(db, folder)
  if (!ids)
    throw new Error('Cần chỉ rõ folder (slug hoặc đường dẫn).')
  return db.prepare('SELECT * FROM folders WHERE id = ?').get(ids[0])
}

/** Creates the wiki tools. `context` holds `{ db, llm, models, wikiDir, indexer }`. */
export function createWikiTools({ db, llm, models, wikiDir, indexer }) {
  return {
    wiki_build: {
      description: 'Dựng hoặc cập nhật wiki cho một folder đã index: trang tóm tắt mỗi tài liệu, trang thực thể/khái niệm có link [[...]], trang mục lục, và trang kiến trúc nếu folder có mã nguồn. Tốn credit Claude: lần đầu gọi không có confirm để xem ước tính, rồi hỏi người dùng trước khi gọi lại với confirm=true.',
      inputSchema: {
        type: 'object',
        properties: { folder: { type: 'string' }, confirm: { type: 'boolean', description: 'true khi người dùng đã đồng ý chi phí' } },
        required: ['folder'],
      },
      async run({ folder, confirm = false }) {
        if (!llm)
          throw new Error('Chưa có ANTHROPIC_API_KEY nên không dựng được wiki.')
        const target = folderOf(db, folder)
        const docs = pendingDocuments(db, target.id)
        if (docs.length === 0 && !target.include_code)
          return 'Wiki đã cập nhật, không có tài liệu mới hoặc thay đổi.'
        const estimate = estimateCost(db, docs, models)
        const summary = `${estimate.docs} tài liệu cần xử lý, khoảng ${estimate.calls} lượt gọi Claude, ước tính ~${estimate.usd.toFixed(2)} USD.`
        if (!confirm && estimate.usd > CONFIRM_ABOVE_USD)
          return `${summary} Hãy hỏi người dùng có đồng ý không, rồi gọi lại với confirm=true.`
        const builder = createWikiBuilder({ db, llm, models, wikiDir })
        const jobId = indexer.startJob('wiki', target.id, jobId => builder.build(target, progress => indexer.updateJob(jobId, { progress })))
        return `${summary} Đang dựng wiki nền: job ${jobId}. Xem tiến độ bằng index_status. File Markdown nằm trong ${wikiDir}.`
      },
    },
    wiki_search: {
      description: 'Tìm trang wiki theo từ khoá (gõ không dấu vẫn được). Ưu tiên khớp tiêu đề, rồi slug, tóm tắt, nội dung.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' }, folder: { type: 'string' } }, required: ['query'] },
      async run({ query, folder }) {
        const match = ftsQuery(query)
        if (!match)
          return '(từ khoá rỗng)'
        const folderIds = findFolderIds(db, folder)
        const rows = db.prepare(`SELECT folder_id, slug, title, summary FROM wiki_fts WHERE wiki_fts MATCH ? ${folderIds ? `AND folder_id IN (${folderIds.join(',')})` : ''} ORDER BY bm25(wiki_fts, ${BM25_WEIGHTS}) LIMIT ?`).all(match, SEARCH_LIMIT)
        const slugs = new Map(db.prepare('SELECT id, slug FROM folders').all().map(row => [row.id, row.slug]))
        return rows.map(row => `${slugs.get(row.folder_id)}:${row.slug} — ${row.summary}`).join('\n') || '(không tìm thấy trang nào)'
      },
    },
    wiki_read_page: {
      description: 'Đọc một trang wiki. slug="index" để xem mục lục (giới thiệu và danh sách mọi trang).',
      inputSchema: { type: 'object', properties: { folder: { type: 'string' }, slug: { type: 'string' } }, required: ['folder', 'slug'] },
      async run({ folder, slug }) {
        const target = folderOf(db, folder)
        if (slug === 'index')
          return truncate(renderIndex(db, target), MAX_PAGE_CHARS)
        const page = getPage(db, target.id, slug)
        if (!page)
          throw new Error(`Không có trang ${slug}. Dùng wiki_search hoặc đọc index.`)
        const backlinks = db.prepare('SELECT from_slug FROM wiki_links WHERE folder_id = ? AND to_slug = ?').all(target.id, slug).map(row => row.from_slug)
        return truncate(`${page.content}\n\n---\nNguồn: ${page.sourceDocIds.length} tài liệu${backlinks.length ? ` | Được nhắc tới ở: ${backlinks.join(', ')}` : ''}`, MAX_PAGE_CHARS)
      },
    },
    wiki_write_page: {
      description: 'Tạo hoặc ghi đè một trang wiki (ví dụ trang tổng hợp do bạn viết). Slug dạng "concept/ten-trang", "entity/ten-trang" hoặc "overview/ten-trang". Link tới trang khác bằng [[slug|tên]].',
      inputSchema: {
        type: 'object',
        properties: {
          folder: { type: 'string' },
          slug: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string', description: 'Một câu cho mục lục' },
          content: { type: 'string', description: 'Markdown' },
        },
        required: ['folder', 'slug', 'title', 'summary', 'content'],
      },
      async run({ folder, slug, title, summary, content }) {
        const target = folderOf(db, folder)
        const type = ['entity', 'concept', 'overview'].find(prefix => String(slug).startsWith(`${prefix}/`)) ?? 'overview'
        const safeSlug = normalizeSlug(slug, title, type)
        const existing = getPage(db, target.id, safeSlug)
        const valid = new Set([...listPages(db, target.id).map(page => page.slug), safeSlug])
        await savePage(db, wikiDir, target, { ...existing, slug: safeSlug, title, summary, page_type: type, content: cleanDeadLinks(content, valid) })
        return `Đã lưu trang ${safeSlug}.`
      },
    },
    wiki_replace_text: {
      description: 'Sửa một đoạn chữ chính xác trong một trang wiki (old_text phải xuất hiện đúng một lần).',
      inputSchema: {
        type: 'object',
        properties: { folder: { type: 'string' }, slug: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } },
        required: ['folder', 'slug', 'old_text', 'new_text'],
      },
      async run({ folder, slug, old_text: oldText, new_text: newText }) {
        const target = folderOf(db, folder)
        const page = getPage(db, target.id, slug)
        if (!page)
          throw new Error(`Không có trang ${slug}.`)
        const count = page.content.split(oldText).length - 1
        if (count !== 1)
          throw new Error(`old_text xuất hiện ${count} lần, cần đúng 1 lần.`)
        await savePage(db, wikiDir, target, { ...page, content: page.content.replace(oldText, newText) })
        return `Đã sửa trang ${slug}.`
      },
    },
  }
}
