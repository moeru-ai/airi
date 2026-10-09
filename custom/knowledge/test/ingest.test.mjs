/* eslint-disable test/no-import-node-test, no-restricted-syntax -- custom/ is outside the AIRI Vitest workspace and runs on node --test. Plain Node.js ESM needs file extensions. */
import assert from 'node:assert/strict'

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { openDatabase } from '../db.mjs'
import { createIndexer, listFolderFiles, slugify } from '../ingest.mjs'
import { createLlm } from '../llm.mjs'
import { hybridSearch } from '../search.mjs'
import { createFixtures } from './fixtures.mjs'

const MODELS = { embed: 'voyage-3.5', embedCode: 'voyage-code-3', vision: 'claude-haiku-5-5', profile: 'claude-haiku-5-5' }

/** A fake Claude client: profiles and vision replies chosen by the request's schema. */
function fakeLlm() {
  const calls = []
  const stream = (params) => {
    calls.push(params)
    const isVision = params.messages[0].content[0]?.type === 'image'
    const text = isVision
      ? JSON.stringify({ caption: 'Sơ đồ kiến trúc hệ thống', ocr_text: 'AIRI gọi MCP knowledge' })
      : JSON.stringify({ summary: 'Báo cáo chi phí và kế hoạch.', gist: 'Chi phí dự án', topics: ['chi phí', 'kế hoạch'], doc_type: 'báo cáo' })
    return { finalMessage: async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: {} }) }
  }
  return { calls, llm: createLlm({ client: { messages: { stream }, beta: { messages: { stream } } } }) }
}

/** A fake embedder: a 4-d vector of letter counts, enough to rank related text higher. */
async function fakeEmbedder(texts) {
  return texts.map(text => Float32Array.from(['a', 'e', 'i', 'o'].map(letter => text.split(letter).length)))
}

describe('ingest', () => {
  let root
  let docs
  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'knowledge-root-'))
    docs = await createFixtures()
  })
  after(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(docs, { recursive: true, force: true })
  })

  it('slugifies Vietnamese folder names', () => {
    assert.equal(slugify('Tài liệu Dự án đẹp'), 'tai-lieu-du-an-dep')
  })

  it('lists documents and skips secrets, dependencies, and lockfiles', async () => {
    const project = join(root, 'project')
    await mkdir(join(project, 'node_modules', 'pkg'), { recursive: true })
    await mkdir(join(project, 'src'), { recursive: true })
    await writeFile(join(project, 'README.md'), '# Dự án')
    await writeFile(join(project, '.env.local'), 'SECRET=1')
    await writeFile(join(project, 'node_modules', 'pkg', 'index.md'), 'x')
    await writeFile(join(project, 'pnpm-lock.yaml'), 'x')
    await writeFile(join(project, 'src', 'app.ts'), 'export const x = 1')
    assert.deepEqual((await listFolderFiles(project, false)).sort(), ['README.md'])
    assert.deepEqual((await listFolderFiles(project, true)).sort(), ['README.md', 'src/app.ts'])
  })

  it('indexes a folder with profiles, vision chunks, and vectors, then syncs changes', async () => {
    const db = openDatabase(':memory:')
    const { llm, calls } = fakeLlm()
    const indexer = createIndexer({ db, roots: [docs], embedder: fakeEmbedder, llm, models: MODELS })

    const { jobId } = await indexer.addFolder(docs)
    await indexer.idle()
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId)
    assert.equal(job.status, 'done')
    const progress = JSON.parse(job.progress)
    assert.equal(progress.errors, 0)

    const report = db.prepare('SELECT * FROM documents WHERE rel = \'report.docx\'').get()
    assert.equal(report.status, 'indexed')
    const types = db.prepare('SELECT chunk_type FROM chunks WHERE doc_id = ?').all(report.id).map(row => row.chunk_type)
    assert.ok(types.includes('image_caption') && types.includes('image_ocr') && types.includes('text'))
    assert.ok(calls.some(call => call.messages[0].content[0]?.type === 'image'), 'vision was called')

    const diagram = db.prepare('SELECT * FROM documents WHERE rel = \'diagram.png\'').get()
    assert.equal(diagram.kind, 'image')
    assert.equal(db.prepare('SELECT count(*) AS n FROM chunks c LEFT JOIN embeddings e ON e.chunk_id = c.id WHERE e.chunk_id IS NULL').get().n, 0)

    const hits = hybridSearch(db, 'so do kien truc', new Map())
    assert.ok(hits.some(hit => hit.chunk_type === 'image_caption'), 'OCR and captions are searchable without diacritics')

    // Edit one file, delete another, sync again.
    await writeFile(join(docs, 'notes.md'), '# Ghi chú\nNội dung mới hoàn toàn.')
    await rm(join(docs, 'page.html'))
    const [{ jobId: second }] = await indexer.syncFolders()
    await indexer.idle()
    const again = JSON.parse(db.prepare('SELECT progress FROM jobs WHERE id = ?').get(second).progress)
    assert.equal(again.indexed, 1)
    assert.equal(again.removed, 1)
    assert.ok(again.unchanged >= 5)
    assert.equal(db.prepare('SELECT count(*) AS n FROM documents WHERE rel = \'page.html\'').get().n, 0)
  })

  it('refuses folders outside the allowed roots', async () => {
    const db = openDatabase(':memory:')
    const indexer = createIndexer({ db, roots: [root], models: MODELS })
    await assert.rejects(indexer.addFolder(docs), /không nằm trong thư mục được phép/)
  })

  it('works without keys: keyword search only, no vision or profile', async () => {
    const db = openDatabase(':memory:')
    const indexer = createIndexer({ db, roots: [docs], models: MODELS })
    await indexer.addFolder(docs)
    await indexer.idle()
    assert.equal(db.prepare('SELECT count(*) AS n FROM embeddings').get().n, 0)
    assert.ok(hybridSearch(db, 'claude', new Map()).length > 0)
  })

  it('removes a folder with its chunks and search rows', async () => {
    const db = openDatabase(':memory:')
    const indexer = createIndexer({ db, roots: [docs], models: MODELS })
    await indexer.addFolder(docs)
    await indexer.idle()
    await indexer.removeFolder(docs)
    assert.equal(db.prepare('SELECT count(*) AS n FROM chunks').get().n, 0)
    assert.equal(db.prepare('SELECT count(*) AS n FROM chunks_fts').get().n, 0)
  })
})
