/* eslint-disable test/no-import-node-test, no-restricted-syntax -- custom/ is outside the AIRI Vitest workspace and runs on node --test. Plain Node.js ESM needs file extensions. */
import assert from 'node:assert/strict'

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { openDatabase } from '../db.mjs'
import { createIndexer } from '../ingest.mjs'
import { createLlm } from '../llm.mjs'
import { DEDUP_SYSTEM, EXTRACT_SYSTEM, INDEX_SYSTEM, MODIFY_SYSTEM, SUMMARY_SYSTEM } from '../wiki-prompts.mjs'
import { cleanDeadLinks, linkify, normalizeSlug } from '../wiki-store.mjs'
import { createWikiTools } from '../wiki-tools.mjs'

const MODELS = { embed: 'e', embedCode: 'c', vision: 'claude-haiku-5-5', profile: 'claude-haiku-5-5', wikiMap: 'claude-haiku-5-5', wikiReduce: 'claude-sonnet-5-5' }

const item = (name, slug, aliases = []) => ({ name, slug, aliases, description: `${name} là một mục trong tài liệu.`, details: `${name} được nhắc nhiều lần.` })

/** Fake Claude that answers by system prompt. Records which prompts ran. */
function fakeLlm() {
  const calls = []
  const stream = (params) => {
    const system = params.system[0].text
    const user = typeof params.messages[0].content === 'string' ? params.messages[0].content : ''
    calls.push(system)
    let text = 'SUMMARY: ok\n# ok'
    if (system === EXTRACT_SYSTEM) {
      text = JSON.stringify(user.includes('desktop')
        ? { entities: [item('AIRI desktop', 'entity/airi-desktop')], concepts: [] }
        : { entities: [item('AIRI', 'entity/airi', ['Project AIRI'])], concepts: [item('Retrieval-Augmented Generation', 'Concept/RAG!!', ['RAG'])] })
    }
    else if (system === SUMMARY_SYSTEM) {
      text = 'SUMMARY: Tóm tắt tài liệu về AIRI.\n# Tài liệu\nAIRI dùng RAG. Xem [[entity/ghost|Ghost]].'
    }
    else if (system === DEDUP_SYSTEM) {
      text = JSON.stringify({ merges: [{ new_slug: 'entity/airi-desktop', existing_slug: 'entity/airi' }, { new_slug: 'entity/airi-desktop', existing_slug: 'entity/made-up' }] })
    }
    else if (system === MODIFY_SYSTEM) {
      const title = /<title>(.*)<\/title>/.exec(user)[1]
      text = `SUMMARY: ${title} trong dự án.\n# ${title}\n${title} là thành phần chính, liên quan tới Retrieval-Augmented Generation và AIRI.`
    }
    else if (system === INDEX_SYSTEM) {
      text = '# Wiki dự án\nWiki về AIRI.'
    }
    return { finalMessage: async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 200 } }) }
  }
  return { calls, llm: createLlm({ client: { messages: { stream }, beta: { messages: { stream } } } }) }
}

describe('wiki helpers', () => {
  it('keeps valid slugs and rebuilds invalid ones from the name', () => {
    assert.equal(normalizeSlug('entity/airi', 'AIRI', 'entity'), 'entity/airi')
    assert.equal(normalizeSlug('Concept/RAG!!', 'Truy xuất tăng cường', 'concept'), 'concept/truy-xuat-tang-cuong')
    assert.equal(normalizeSlug('concept/../../x', 'X y', 'concept'), 'concept/x-y')
  })

  it('links the first plain mention only, never inside code, links, or headings', () => {
    const pages = [{ slug: 'entity/airi', title: 'AIRI', aliases: [] }, { slug: 'concept/rag', title: 'RAG', aliases: ['Retrieval'] }]
    const content = '# AIRI\n`AIRI` trong code. [AIRI](http://x). AIRI dùng RAG, rồi AIRI lại dùng RAG.'
    assert.equal(linkify(content, pages, 'self'), '# AIRI\n`AIRI` trong code. [AIRI](http://x). [[entity/airi|AIRI]] dùng [[concept/rag|RAG]], rồi AIRI lại dùng RAG.')
  })

  it('does not link a page to itself or inside a longer word', () => {
    const pages = [{ slug: 'entity/vue', title: 'Vue', aliases: [] }]
    assert.equal(linkify('Vue và Vuex', pages, 'entity/vue'), 'Vue và Vuex')
    assert.equal(linkify('dùng Vuex', pages, 'other'), 'dùng Vuex')
  })

  it('turns dead links into plain text', () => {
    assert.equal(cleanDeadLinks('[[entity/a|A]] và [[entity/b|B]] và [[entity/c]]', new Set(['entity/a'])), '[[entity/a|A]] và B và entity/c')
  })
})

describe('wiki build', () => {
  let root
  let wikiDir
  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'wiki-docs-'))
    wikiDir = await mkdtemp(join(tmpdir(), 'wiki-out-'))
    await writeFile(join(root, 'tong-quan.md'), `# Tổng quan\n${'AIRI là companion dùng RAG để trả lời. '.repeat(10)}`)
  })
  after(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(wikiDir, { recursive: true, force: true })
  })

  it('builds pages, dedups on the next build, links pages, and retracts deleted documents', async () => {
    const db = openDatabase(':memory:')
    const { llm, calls } = fakeLlm()
    const indexer = createIndexer({ db, roots: [root], models: MODELS })
    await indexer.addFolder(root)
    await indexer.idle()
    const tools = createWikiTools({ db, llm, models: MODELS, wikiDir, indexer })

    const first = await tools.wiki_build.run({ folder: root })
    assert.match(first, /job/)
    await indexer.idle()
    const job = db.prepare('SELECT * FROM jobs WHERE kind = \'wiki\'').get()
    assert.equal(job.status, 'done', job.error)

    const index = await tools.wiki_read_page.run({ folder: root, slug: 'index' })
    assert.match(index, /# Wiki dự án/)
    assert.match(index, /\[\[entity\/airi\|AIRI\]\]/)
    assert.match(index, /concept\/truy-xuat|concept\/retrieval-augmented-generation/)

    const summaryPage = await tools.wiki_read_page.run({ folder: root, slug: 'summary/tong-quan-md' })
    assert.doesNotMatch(summaryPage, /entity\/ghost/, 'dead link removed')
    const airi = await tools.wiki_read_page.run({ folder: root, slug: 'entity/airi' })
    assert.match(airi, /\[\[concept\/[a-z-]+\|Retrieval-Augmented Generation\]\]/, 'linkify added a link')
    const file = await readFile(join(wikiDir, 'wiki-docs-', 'entity', 'airi.md'), 'utf8').catch(() => readFile(join(wikiDir, db.prepare('SELECT slug FROM folders').get().slug, 'entity', 'airi.md'), 'utf8'))
    assert.match(file, /^---\ntitle: "AIRI"/)

    // Second build: a new document mentioning "AIRI desktop" gets merged into entity/airi.
    await writeFile(join(root, 'desktop.md'), `# Desktop\n${'Bản AIRI desktop chạy bằng Electron. '.repeat(10)}`)
    await indexer.syncFolders()
    await indexer.idle()
    await tools.wiki_build.run({ folder: root })
    await indexer.idle()
    assert.ok(calls.includes(DEDUP_SYSTEM), 'dedup ran')
    const slugs = db.prepare('SELECT slug FROM wiki_pages').all().map(row => row.slug)
    assert.ok(!slugs.includes('entity/airi-desktop'), 'merged into the existing page')
    assert.ok(!slugs.includes('entity/made-up'), 'merge to an unknown page is ignored')

    // Nothing changed: no new build needed.
    assert.match(await tools.wiki_build.run({ folder: root }), /không có tài liệu mới/)

    // Delete the first document: its summary page goes away.
    await rm(join(root, 'tong-quan.md'))
    await indexer.syncFolders()
    await indexer.idle()
    await writeFile(join(root, 'desktop.md'), `# Desktop\n${'Bản AIRI desktop chạy bằng Electron, có sửa. '.repeat(10)}`)
    await indexer.syncFolders()
    await indexer.idle()
    await tools.wiki_build.run({ folder: root })
    await indexer.idle()
    const after = db.prepare('SELECT slug FROM wiki_pages').all().map(row => row.slug)
    assert.ok(!after.includes('summary/tong-quan-md'))

    const found = await tools.wiki_search.run({ query: 'airi' })
    assert.match(found, /entity\/airi/)
  })

  it('asks for confirmation when the estimate is above 1 USD', async () => {
    const big = await mkdtemp(join(tmpdir(), 'wiki-big-'))
    // Each document counts at most 32k characters, so it takes several large ones to pass 1 USD.
    for (let index = 0; index < 12; index++)
      await writeFile(join(big, `doc-${index}.md`), `Nội dung rất dài số ${index}. `.repeat(3000))
    const db = openDatabase(':memory:')
    const indexer = createIndexer({ db, roots: [big], models: MODELS })
    await indexer.addFolder(big)
    await indexer.idle()
    const tools = createWikiTools({ db, llm: fakeLlm().llm, models: MODELS, wikiDir, indexer })
    assert.match(await tools.wiki_build.run({ folder: big }), /confirm=true/)
    assert.equal(db.prepare('SELECT count(*) AS n FROM jobs WHERE kind = \'wiki\'').get().n, 0)
    await rm(big, { recursive: true, force: true })
  })

  it('refuses to build without an Anthropic key', async () => {
    const tools = createWikiTools({ db: openDatabase(':memory:'), models: MODELS, wikiDir })
    await assert.rejects(tools.wiki_build.run({ folder: 'x' }), /ANTHROPIC_API_KEY/)
  })
})
