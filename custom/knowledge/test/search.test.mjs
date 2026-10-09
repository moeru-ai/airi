/* eslint-disable test/no-import-node-test, no-restricted-syntax -- custom/ is outside the AIRI Vitest workspace and runs on node --test. Plain Node.js ESM needs file extensions. */
import assert from 'node:assert/strict'

import { describe, it } from 'node:test'

import { insertChunks, openDatabase, saveEmbedding } from '../db.mjs'
import { createEmbedder, embeddingText } from '../embed.mjs'
import { ftsQuery, fuse, hybridSearch, invalidateVectorCache, keywordSearch, mmr } from '../search.mjs'

const MODEL = 'test-model'

function seed() {
  const db = openDatabase(':memory:')
  const now = new Date().toISOString()
  db.prepare('INSERT INTO folders (id, path, slug, added_at) VALUES (1, \'D:/a\', \'a\', ?), (2, \'D:/b\', \'b\', ?)').run(now, now)
  db.prepare('INSERT INTO documents (id, folder_id, path, rel, kind, hash, title, updated_at) VALUES (1, 1, \'D:/a/kien-truc.md\', \'kien-truc.md\', \'doc\', \'h1\', \'Kiến trúc\', ?), (2, 2, \'D:/b/chi-phi.md\', \'chi-phi.md\', \'doc\', \'h2\', \'Chi phí\', ?)').run(now, now)
  const ids = insertChunks(db, 1, 'Kiến trúc', [
    { type: 'text', header: 'Tổng quan', content: 'AIRI dùng Electron và Vue cho giao diện desktop.' },
    { type: 'text', header: 'Tổng quan', content: 'Mai là thư ký, chạy MCP server để đọc tài liệu.' },
  ])
  const otherIds = insertChunks(db, 2, 'Chi phí', [{ type: 'text', header: '', content: 'Chi phí Claude API mỗi tháng là 100 USD.' }])
  // Fake 3-d vectors: chunk 0 points along x, chunk 1 along y, the cost chunk along z.
  saveEmbedding(db, ids[0], MODEL, Float32Array.of(1, 0, 0))
  saveEmbedding(db, ids[1], MODEL, Float32Array.of(0, 1, 0))
  saveEmbedding(db, otherIds[0], MODEL, Float32Array.of(0, 0, 1))
  invalidateVectorCache()
  return { db, ids, otherIds }
}

describe('ftsQuery', () => {
  it('quotes each word and drops punctuation, so input cannot inject FTS syntax', () => {
    assert.equal(ftsQuery('kiến trúc "AIRI" OR *'), '"kiến" OR "trúc" OR "airi" OR "or"')
    assert.equal(ftsQuery('!!!'), '')
  })
})

describe('keywordSearch', () => {
  it('matches Vietnamese text typed without diacritics', () => {
    const { db, ids } = seed()
    const hits = keywordSearch(db, 'giao dien desktop')
    assert.equal(hits[0].chunkId, ids[0])
  })

  it('filters by folder', () => {
    const { db } = seed()
    assert.equal(keywordSearch(db, 'chi phi', { folderIds: [1] }).length, 0)
    assert.equal(keywordSearch(db, 'chi phi', { folderIds: [2] }).length, 1)
  })
})

describe('fuse', () => {
  it('weights vector rank above keyword rank', () => {
    const fused = fuse([{ chunkId: 1 }, { chunkId: 2 }], [{ chunkId: 2 }, { chunkId: 1 }])
    assert.equal(fused[0].chunkId, 1)
  })
})

describe('mmr', () => {
  it('skips a near-duplicate in favor of a different result', () => {
    const items = [
      { id: 'a', score: 1, content: 'mai thư ký đọc tài liệu' },
      { id: 'b', score: 0.95, content: 'mai thư ký đọc tài liệu' },
      { id: 'c', score: 0.9, content: 'chi phí claude hàng tháng' },
    ]
    assert.deepEqual(mmr(items, 2).map(item => item.id), ['a', 'c'])
  })
})

describe('hybridSearch', () => {
  it('combines vector and keyword hits and returns document info', () => {
    const { db, ids } = seed()
    const results = hybridSearch(db, 'thư ký', new Map([[MODEL, Float32Array.of(0, 1, 0)]]))
    assert.equal(results[0].id, ids[1])
    assert.equal(results[0].rel, 'kien-truc.md')
    assert.equal(results[0].header, 'Tổng quan')
  })

  it('works with keyword search only when there are no vectors', () => {
    const { db, otherIds } = seed()
    const results = hybridSearch(db, 'claude', new Map())
    assert.deepEqual(results.map(result => result.id), [otherIds[0]])
  })
})

describe('createEmbedder', () => {
  it('returns undefined without an API key', () => {
    assert.equal(createEmbedder({}), undefined)
  })

  it('sends input_type, batches, keeps order, and retries on 429', async () => {
    const calls = []
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body)
      calls.push(body)
      if (calls.length === 1)
        return new Response('{}', { status: 429 })
      const data = body.input.map((_, index) => ({ index, embedding: [index, body.input.length] })).reverse()
      return Response.json({ data })
    }
    const embed = createEmbedder({ apiKey: 'k', fetchImpl })
    const vectors = await embed(Array.from({ length: 70 }, (_, index) => `t${index}`), { model: 'voyage-3.5', inputType: 'query' })
    assert.equal(vectors.length, 70)
    assert.deepEqual([...vectors[1]], [1, 64])
    assert.deepEqual([...vectors[65]], [1, 6])
    assert.equal(calls[1].input_type, 'query')
    assert.equal(calls.length, 3)
  })

  it('reports Voyage errors with the status code', async () => {
    const embed = createEmbedder({ apiKey: 'k', fetchImpl: async () => Response.json({ detail: 'bad key' }, { status: 401 }) })
    await assert.rejects(embed(['x'], { model: 'm' }), /Voyage HTTP 401: bad key/)
  })
})

describe('embeddingText', () => {
  it('joins title, heading, and content like WeKnora', () => {
    assert.equal(embeddingText({ title: 'T', header: 'A > B', content: 'nội dung' }), 'T\nA > B\n\nnội dung')
    assert.equal(embeddingText({ title: 'T', header: '', content: 'x' }), 'T\nx')
  })
})
