// Wiki builder: map (per document) → dedup → reduce (per page) → finalize (index, links).
// A lighter version of WeKnora's wiki_ingest*.go: evidence chunks come from FTS on the page's
// name and aliases instead of a separate LLM citation pass.

/* eslint-disable no-restricted-syntax -- Plain Node.js ESM needs file extensions. */
import { slugify } from './ingest.mjs'
import { ftsQuery } from './search.mjs'
import { ARCHITECTURE_SYSTEM, DEDUP_SCHEMA, DEDUP_SYSTEM, EXTRACT_SCHEMA, EXTRACT_SYSTEM, INDEX_SYSTEM, MODIFY_SYSTEM, splitSummary, SUMMARY_SYSTEM } from './wiki-prompts.mjs'
import { cleanDeadLinks, deletePage, getPage, linkify, listPages, normalizeSlug, savePage } from './wiki-store.mjs'

const MAX_DOC_CHARS = 32_000
const EVIDENCE_CHUNKS = 5
const DEDUP_CANDIDATES = 3
const MAP_CONCURRENCY = 4
const REDUCE_CONCURRENCY = 3
const README = /(?:^|\/)readme(?:\.[a-z]+)?$/i
const MAX_TREE_LINES = 80
// USD per million tokens (input, output). From the claude-api skill model table, cached 2026-10-06.
const PRICES = { 'claude-haiku-5-5': [0.10, 0.50], 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20] }
// Rough sizes for the estimate. Vietnamese text runs at about 3 characters per token.
const CHARS_PER_TOKEN = 3
const EST_PAGES_PER_DOC = 8
const EST_MAP_OUTPUT_TOKENS = 3500
const EST_REDUCE_INPUT_TOKENS = 3000
const EST_REDUCE_OUTPUT_TOKENS = 1500
const EST_FIXED_CALLS_TOKENS = 8000

function cost(model, input, output) {
  const [inPrice, outPrice] = PRICES[model] ?? PRICES['claude-sonnet-5-5']
  return (input * inPrice + output * outPrice) / 1_000_000
}

/** Runs `worker` over `items` with at most `limit` at a time. */
async function pool(items, limit, worker) {
  const results = []
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index])
    }
  }))
  return results
}

/** Documents whose content changed since the last wiki build. */
export function pendingDocuments(db, folderId) {
  return db.prepare('SELECT * FROM documents WHERE folder_id = ? AND status = \'indexed\' AND kind IN (\'doc\', \'image\') AND (wiki_hash IS NULL OR wiki_hash != hash) ORDER BY rel').all(folderId)
}

function documentText(db, docId) {
  const rows = db.prepare('SELECT chunk_type, content FROM chunks WHERE doc_id = ? AND chunk_type != \'summary\' ORDER BY seq').all(docId)
  return rows.map(row => row.chunk_type.startsWith('image_') ? `<${row.chunk_type}>${row.content}</${row.chunk_type}>` : row.content).join('\n\n').slice(0, MAX_DOC_CHARS)
}

/** Estimates the USD cost of building the wiki for these documents. */
export function estimateCost(db, docs, models) {
  const inputTokens = docs.reduce((sum, doc) => sum + documentText(db, doc.id).length / CHARS_PER_TOKEN, 0)
  const mapCost = cost(models.wikiMap, inputTokens * 2, docs.length * EST_MAP_OUTPUT_TOKENS)
  const pages = docs.length * EST_PAGES_PER_DOC
  const reduceCost = cost(models.wikiReduce, pages * EST_REDUCE_INPUT_TOKENS + EST_FIXED_CALLS_TOKENS, pages * EST_REDUCE_OUTPUT_TOKENS)
  return { usd: mapCost + reduceCost, docs: docs.length, calls: docs.length * 2 + pages + 2 }
}

function evidenceFor(db, docId, item) {
  const match = ftsQuery([item.name, ...item.aliases].join(' '))
  if (!match)
    return []
  return db.prepare(`SELECT c.content FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid
    WHERE chunks_fts MATCH ? AND c.doc_id = ? ORDER BY bm25(chunks_fts) LIMIT ?`).all(match, docId, EVIDENCE_CHUNKS).map(row => row.content)
}

function pageList(pages) {
  return pages.map(page => `[[${page.slug}]] = ${page.title}${page.aliases?.length ? ` (Aliases: ${page.aliases.join(', ')})` : ''}`).join('\n') || '(trống)'
}

/** Creates the wiki builder. `context` holds `{ db, llm, models, wikiDir }`. */
export function createWikiBuilder({ db, llm, models, wikiDir }) {
  const usage = { usd: 0 }
  async function call(model, params) {
    const result = await llm({ model, ...params })
    usage.usd += cost(model, result.usage.input, result.usage.output)
    return result
  }

  /** Map: extract entities and concepts, and write the document's summary page. */
  async function mapDocument(folder, doc) {
    const text = documentText(db, doc.id)
    const existing = listPages(db, folder.id)
    const previous = existing.filter(page => page.sourceDocIds.includes(doc.id) && (page.page_type === 'entity' || page.page_type === 'concept'))
    const { json } = await call(models.wikiMap, {
      system: EXTRACT_SYSTEM,
      schema: EXTRACT_SCHEMA,
      content: `<previous_slugs>\n${previous.map(page => page.slug).join('\n') || '(không có)'}\n</previous_slugs>\n\n<document title="${doc.rel}">\n${text}\n</document>`,
    })
    const items = [...json.entities.map(item => ({ ...item, type: 'entity' })), ...json.concepts.map(item => ({ ...item, type: 'concept' }))]
      .map(item => ({ ...item, slug: normalizeSlug(item.slug, item.name, item.type), evidence: evidenceFor(db, doc.id, item) }))
    const { text: summaryText } = await call(models.wikiMap, {
      system: SUMMARY_SYSTEM,
      content: `<available_wiki_pages>\n${pageList([...existing, ...items.map(item => ({ slug: item.slug, title: item.name, aliases: item.aliases }))])}\n</available_wiki_pages>\n\n<document title="${doc.rel}">\n${text}\n</document>`,
    })
    const { summary, content } = splitSummary(summaryText)
    const summaryPage = { slug: `summary/${slugify(doc.rel)}`, title: doc.rel, page_type: 'summary', summary, content, sourceDocIds: [doc.id] }
    return { doc, items, summaryPage, previous }
  }

  /** Dedup: maps a new slug to an existing page when the model is sure they are the same thing. */
  async function dedup(folder, items) {
    const fresh = items.filter(item => !getPage(db, folder.id, item.slug))
    const withCandidates = fresh.map((item) => {
      const match = ftsQuery([item.name, ...item.aliases].join(' '))
      const candidates = match
        ? db.prepare('SELECT slug, title, summary FROM wiki_fts WHERE wiki_fts MATCH ? AND folder_id = ? AND slug LIKE ? LIMIT ?').all(`title : (${match})`, folder.id, `${item.type}/%`, DEDUP_CANDIDATES)
        : []
      return { item, candidates }
    }).filter(entry => entry.candidates.length > 0)
    if (withCandidates.length === 0)
      return new Map()
    const { json } = await call(models.wikiMap, {
      system: DEDUP_SYSTEM,
      schema: DEDUP_SCHEMA,
      content: withCandidates.map(({ item, candidates }) => `<item slug="${item.slug}" name="${item.name}">${item.description}\n<candidates>\n${candidates.map(c => `${c.slug}: ${c.title} — ${c.summary}`).join('\n')}\n</candidates></item>`).join('\n\n'),
    })
    const allowed = new Map(withCandidates.map(({ item, candidates }) => [item.slug, new Set(candidates.map(c => c.slug))]))
    return new Map(json.merges.filter(merge => allowed.get(merge.new_slug)?.has(merge.existing_slug)).map(merge => [merge.new_slug, merge.existing_slug]))
  }

  /** Reduce: merges every update for one slug into its page (Sonnet, compiler-style). */
  async function reducePage(folder, slug, updates, validSlugs) {
    const existing = getPage(db, folder.id, slug)
    const first = updates[0].item
    const title = existing?.title ?? first.name
    const aliases = [...new Set([...(existing?.aliases ?? []), ...updates.flatMap(update => update.item.aliases)])].filter(alias => alias !== title)
    const newInformation = updates.map(({ doc, item }) => `<source document="${doc.rel}">\n${item.details}\n${item.evidence.map(chunk => `<chunk>${chunk}</chunk>`).join('\n')}\n</source>`).join('\n\n')
    const { text } = await call(models.wikiReduce, {
      system: MODIFY_SYSTEM,
      effort: 'medium',
      content: [
        `<source_context>\n${updates.map(({ doc }) => `${doc.rel}: ${doc.gist ?? ''}`).join('\n')}\n</source_context>`,
        `<page_metadata>\n<slug>${slug}</slug>\n<title>${title}</title>\n<type>${first.type}</type>\n<aliases>${aliases.join(', ')}</aliases>\n</page_metadata>`,
        `Trang này nói riêng về **${title}**. Mọi câu trên trang phải nói về đúng ${first.type === 'entity' ? 'thực thể' : 'khái niệm'} này.`,
        `<existing_page_content>\n${existing?.content ?? '(trang mới)'}\n</existing_page_content>`,
        `<new_information>\n${newInformation}\n</new_information>`,
        `<valid_wiki_links>\n${[...validSlugs].filter(other => other !== slug).join('\n')}\n</valid_wiki_links>`,
      ].join('\n\n'),
    })
    const { summary, content } = splitSummary(text)
    const sourceDocIds = [...new Set([...(existing?.sourceDocIds ?? []), ...updates.map(update => update.doc.id)])]
    return savePage(db, wikiDir, folder, { slug, title, page_type: first.type, summary: summary || first.description, content, aliases, sourceDocIds })
  }

  async function architecturePage(folder, validSlugs) {
    const docs = db.prepare('SELECT rel, kind, gist FROM documents WHERE folder_id = ? AND status = \'indexed\' ORDER BY rel').all(folder.id)
    const dirs = new Map()
    for (const doc of docs) {
      const dir = doc.rel.split('/').slice(0, 2).join('/')
      dirs.set(dir, (dirs.get(dir) ?? 0) + 1)
    }
    const readmes = docs.filter(doc => README.test(doc.rel)).map(doc => `<readme path="${doc.rel}">\n${documentText(db, db.prepare('SELECT id FROM documents WHERE folder_id = ? AND rel = ?').get(folder.id, doc.rel).id).slice(0, MAX_DOC_CHARS / 4)}\n</readme>`)
    const { text } = await call(models.wikiReduce, {
      system: ARCHITECTURE_SYSTEM,
      effort: 'medium',
      content: [
        `<file_tree>\n${[...dirs].slice(0, MAX_TREE_LINES).map(([dir, count]) => `${dir} (${count} file)`).join('\n')}\n</file_tree>`,
        ...readmes,
        `<document_summaries>\n${docs.filter(doc => doc.gist).map(doc => `${doc.rel}: ${doc.gist}`).join('\n')}\n</document_summaries>`,
        `<valid_wiki_links>\n${[...validSlugs].join('\n')}\n</valid_wiki_links>`,
      ].join('\n\n'),
    })
    const { summary, content } = splitSummary(text)
    return savePage(db, wikiDir, folder, { slug: 'overview/architecture', title: 'Kiến trúc dự án', page_type: 'overview', summary, content })
  }

  /** Removes a document from pages it no longer supports, and deletes pages left without sources. */
  async function retract(folder, page, docId) {
    const sourceDocIds = page.sourceDocIds.filter(id => id !== docId)
    if (sourceDocIds.length === 0)
      return deletePage(db, wikiDir, folder, page.slug)
    return savePage(db, wikiDir, folder, { ...page, sourceDocIds })
  }

  /** Builds or updates the wiki of one folder. `report(progress)` receives progress updates. */
  async function build(folder, report = () => {}) {
    const docs = pendingDocuments(db, folder.id)
    const liveDocIds = new Set(db.prepare('SELECT id FROM documents WHERE folder_id = ?').all(folder.id).map(row => row.id))
    report({ phase: 'map', total: docs.length, done: 0 })
    let mapped = 0
    const maps = await pool(docs, MAP_CONCURRENCY, async (doc) => {
      const result = await mapDocument(folder, doc)
      report({ phase: 'map', done: ++mapped, usd: Number(usage.usd.toFixed(4)) })
      return result
    })

    const merges = await dedup(folder, maps.flatMap(map => map.items))
    const updatesBySlug = new Map()
    for (const map of maps) {
      await savePage(db, wikiDir, folder, map.summaryPage)
      for (const item of map.items) {
        const slug = merges.get(item.slug) ?? item.slug
        updatesBySlug.set(slug, [...(updatesBySlug.get(slug) ?? []), { doc: map.doc, item }])
      }
    }
    const validSlugs = new Set([...listPages(db, folder.id).map(page => page.slug), ...updatesBySlug.keys()])
    let reduced = 0
    report({ phase: 'reduce', total: updatesBySlug.size, done: 0 })
    await pool([...updatesBySlug], REDUCE_CONCURRENCY, async ([slug, updates]) => {
      await reducePage(folder, slug, updates, validSlugs)
      report({ phase: 'reduce', done: ++reduced, usd: Number(usage.usd.toFixed(4)) })
    })

    // Retractions: pages a re-extracted document no longer supports, compared after merges,
    // and pages of deleted documents.
    for (const map of maps) {
      const kept = new Set(map.items.map(item => merges.get(item.slug) ?? item.slug))
      for (const page of map.previous.filter(page => !kept.has(page.slug)))
        await retract(folder, getPage(db, folder.id, page.slug), map.doc.id)
    }
    for (const page of listPages(db, folder.id)) {
      for (const docId of page.sourceDocIds.filter(id => !liveDocIds.has(id)))
        await retract(folder, getPage(db, folder.id, page.slug), docId)
    }

    report({ phase: 'finalize' })
    if (folder.include_code)
      await architecturePage(folder, validSlugs)
    const gists = db.prepare('SELECT rel, gist FROM documents WHERE folder_id = ? AND gist IS NOT NULL').all(folder.id)
    const { text: intro } = await call(models.wikiReduce, { system: INDEX_SYSTEM, content: `<document_summaries>\n${gists.map(doc => `${doc.rel}: ${doc.gist}`).join('\n') || '(chưa có tóm tắt)'}\n</document_summaries>` })
    await savePage(db, wikiDir, folder, { slug: 'index', title: 'Mục lục', page_type: 'overview', summary: 'Trang mục lục của wiki.', content: intro.trim() })

    const pages = listPages(db, folder.id)
    const finalSlugs = new Set(pages.map(page => page.slug))
    for (const page of pages.filter(page => page.slug !== 'index')) {
      const content = linkify(cleanDeadLinks(page.content, finalSlugs), pages, page.slug)
      if (content !== page.content)
        await savePage(db, wikiDir, folder, { ...page, content })
    }
    for (const doc of docs)
      db.prepare('UPDATE documents SET wiki_hash = hash WHERE id = ?').run(doc.id)
    report({ phase: 'done', pages: pages.length, usd: Number(usage.usd.toFixed(4)) })
    return { pages: pages.length, usd: usage.usd }
  }

  return { build }
}
