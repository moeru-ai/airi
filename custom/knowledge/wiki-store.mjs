// Wiki page storage (SQLite + Markdown files), deterministic cross-linking, and the index page.
// Linkify follows WeKnora internal/application/service/wiki_linkify.go: wrap the first occurrence of each
// title or alias, longest first, never inside code, links, or images.

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// eslint-disable-next-line no-restricted-syntax -- Plain Node.js ESM needs the file extension.
import { slugify } from './ingest.mjs'

export const PAGE_TYPES = ['overview', 'summary', 'entity', 'concept']
const PAGE_TYPE_LABELS = { overview: 'Tổng quan', summary: 'Tóm tắt tài liệu', entity: 'Thực thể', concept: 'Khái niệm' }
const SLUG_PATTERN = /^(?:overview|summary|entity|concept)\/[a-z0-9]+(?:-[a-z0-9]+)*$/
const WIKI_LINK = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g
// Spans that linkify must not touch: code fences, inline code, images, links, and existing wiki links.
const PROTECTED_SPAN = /```[\s\S]*?```|`[^`\n]*`|!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\([^)]*\)|\[\[[^\]]*\]\]/g
const MIN_LINK_TERM_CHARS = 3
const WORD_CHAR = /[\p{L}\p{N}_]/u

/** Returns a safe slug: the given one when valid, otherwise "<type>/<slugified name>". */
export function normalizeSlug(slug, name, type) {
  const clean = String(slug ?? '').trim().toLowerCase()
  return SLUG_PATTERN.test(clean) && clean.startsWith(`${type}/`) ? clean : `${type}/${slugify(name)}`
}

function rowToPage(row) {
  return row && { ...row, aliases: JSON.parse(row.aliases), sourceDocIds: JSON.parse(row.source_doc_ids) }
}

export function getPage(db, folderId, slug) {
  return rowToPage(db.prepare('SELECT * FROM wiki_pages WHERE folder_id = ? AND slug = ?').get(folderId, slug))
}

export function listPages(db, folderId) {
  return db.prepare('SELECT * FROM wiki_pages WHERE folder_id = ? ORDER BY page_type, title').all(folderId).map(rowToPage)
}

/** Lists `[[slug]]` targets in Markdown. */
export function outLinks(content) {
  return [...new Set([...content.matchAll(WIKI_LINK)].map(match => match[1].trim()))]
}

/** Replaces links to slugs that do not exist with plain text. */
export function cleanDeadLinks(content, validSlugs) {
  return content.replace(WIKI_LINK, (whole, slug, name) => validSlugs.has(slug.trim()) ? whole : (name || slug))
}

function frontMatter(page) {
  const lines = ['---', `title: ${JSON.stringify(page.title)}`, `type: ${page.page_type}`, `summary: ${JSON.stringify(page.summary)}`]
  if (page.aliases.length > 0)
    lines.push(`aliases: ${JSON.stringify(page.aliases)}`)
  lines.push(`updated: ${page.updated_at}`, '---', '')
  return lines.join('\n')
}

function pageFile(wikiDir, folder, slug) {
  return join(wikiDir, folder.slug, `${slug}.md`)
}

/** Inserts or replaces a page in SQLite, its search row, its links, and its Markdown file. */
export async function savePage(db, wikiDir, folder, page) {
  if (!SLUG_PATTERN.test(page.slug) && page.slug !== 'index')
    throw new Error(`Slug không hợp lệ: ${page.slug}`)
  const saved = { aliases: [], sourceDocIds: [], summary: '', ...page, updated_at: new Date().toISOString() }
  db.prepare(`INSERT OR REPLACE INTO wiki_pages (folder_id, slug, title, page_type, summary, content, aliases, source_doc_ids, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(folder.id, saved.slug, saved.title, saved.page_type, saved.summary, saved.content, JSON.stringify(saved.aliases), JSON.stringify(saved.sourceDocIds), saved.updated_at)
  db.prepare('DELETE FROM wiki_fts WHERE folder_id = ? AND slug = ?').run(folder.id, saved.slug)
  db.prepare('INSERT INTO wiki_fts (folder_id, slug, title, summary, content) VALUES (?, ?, ?, ?, ?)').run(folder.id, saved.slug, `${saved.title} ${saved.aliases.join(' ')}`, saved.summary, saved.content)
  db.prepare('DELETE FROM wiki_links WHERE folder_id = ? AND from_slug = ?').run(folder.id, saved.slug)
  for (const target of outLinks(saved.content))
    db.prepare('INSERT OR IGNORE INTO wiki_links (folder_id, from_slug, to_slug) VALUES (?, ?, ?)').run(folder.id, saved.slug, target)
  const file = pageFile(wikiDir, folder, saved.slug)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${frontMatter(saved)}${saved.content}\n`)
  return saved
}

export async function deletePage(db, wikiDir, folder, slug) {
  db.prepare('DELETE FROM wiki_pages WHERE folder_id = ? AND slug = ?').run(folder.id, slug)
  db.prepare('DELETE FROM wiki_fts WHERE folder_id = ? AND slug = ?').run(folder.id, slug)
  db.prepare('DELETE FROM wiki_links WHERE folder_id = ? AND from_slug = ?').run(folder.id, slug)
  await rm(pageFile(wikiDir, folder, slug), { force: true })
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Wraps the first plain-text mention of each other page's title or alias as `[[slug|text]]`. */
export function linkify(content, pages, selfSlug) {
  const terms = pages
    .filter(page => page.slug !== selfSlug && page.slug !== 'index' && !content.includes(`[[${page.slug}`))
    .flatMap(page => [page.title, ...page.aliases].filter(term => term && term.length >= MIN_LINK_TERM_CHARS).map(term => ({ term, slug: page.slug })))
    .sort((a, b) => b.term.length - a.term.length)
  const linked = new Set()
  let result = content
  for (const { term, slug } of terms) {
    if (linked.has(slug))
      continue
    const protectedRanges = [...result.matchAll(PROTECTED_SPAN)].map(match => [match.index, match.index + match[0].length])
    for (const match of result.matchAll(new RegExp(escapeRegExp(term), 'giu'))) {
      const start = match.index
      const end = start + match[0].length
      const inside = protectedRanges.some(([from, to]) => start >= from && start < to)
      const boundary = !WORD_CHAR.test(result[start - 1] ?? '') && !WORD_CHAR.test(result[end] ?? '')
      // Skip the heading line, where the title itself usually sits.
      const lineStart = result.lastIndexOf('\n', start - 1) + 1
      if (inside || !boundary || result[lineStart] === '#')
        continue
      result = `${result.slice(0, start)}[[${slug}|${match[0]}]]${result.slice(end)}`
      linked.add(slug)
      break
    }
  }
  return result
}

/** Renders the index page: the stored intro plus a directory built from the current pages. */
export function renderIndex(db, folder) {
  const intro = getPage(db, folder.id, 'index')?.content ?? `# Wiki ${folder.slug}`
  const pages = listPages(db, folder.id).filter(page => page.slug !== 'index')
  const sections = PAGE_TYPES.map((type) => {
    const group = pages.filter(page => page.page_type === type)
    return group.length === 0 ? '' : `## ${PAGE_TYPE_LABELS[type]} (${group.length})\n${group.map(page => `- [[${page.slug}|${page.title}]] — ${page.summary}`).join('\n')}`
  }).filter(Boolean)
  return [intro, ...sections].join('\n\n')
}
