// Hybrid retrieval, ported from WeKnora:
// - fusion: weighted RRF 0.7/(60+vRank) + 0.3/(60+kRank) (knowledgebase_search_fusion.go)
// - diversity: MMR with lambda 0.7 over token-set Jaccard similarity (chat_pipeline/rerank.go)

/* eslint-disable no-restricted-syntax -- Plain Node.js ESM needs file extensions. */
import { toVector } from './db.mjs'

const RRF_K = 60
const VECTOR_WEIGHT = 0.7
const KEYWORD_WEIGHT = 0.3
const VECTOR_THRESHOLD = 0.2
const CANDIDATE_LIMIT = 30
const MMR_LAMBDA = 0.7
const DEFAULT_RESULTS = 8

// Vectors per model, loaded once and dropped when the index changes.
let vectorCache = new Map()

/** Call after any embedding write, so the next search reloads vectors. */
export function invalidateVectorCache() {
  vectorCache = new Map()
}

function loadVectors(db, model) {
  if (!vectorCache.has(model)) {
    const rows = db.prepare('SELECT e.chunk_id, e.vector, d.folder_id FROM embeddings e JOIN chunks c ON c.id = e.chunk_id JOIN documents d ON d.id = c.doc_id WHERE e.model = ?').all(model)
    vectorCache.set(model, rows.map(row => ({ chunkId: row.chunk_id, folderId: row.folder_id, vector: toVector(row.vector) })))
  }
  return vectorCache.get(model)
}

function cosine(a, b) {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index]
    normA += a[index] * a[index]
    normB += b[index] * b[index]
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0
}

/** Ranks chunks by cosine similarity for each model's query vector. Returns `[{ chunkId, score }]`. */
export function vectorSearch(db, queryVectors, { folderIds, limit = CANDIDATE_LIMIT } = {}) {
  const hits = []
  for (const [model, query] of queryVectors) {
    for (const entry of loadVectors(db, model)) {
      if (folderIds && !folderIds.includes(entry.folderId))
        continue
      const score = cosine(query, entry.vector)
      if (score >= VECTOR_THRESHOLD)
        hits.push({ chunkId: entry.chunkId, score })
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Builds an FTS5 query that matches any word, each one quoted so user input cannot inject syntax. */
export function ftsQuery(text) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []
  return [...new Set(words)].map(word => `"${word}"`).join(' OR ')
}

/** Ranks chunks with BM25 over content, heading, and title. Returns `[{ chunkId, score }]`. */
export function keywordSearch(db, text, { folderIds, limit = CANDIDATE_LIMIT } = {}) {
  const match = ftsQuery(text)
  if (!match)
    return []
  const folderFilter = folderIds ? `AND d.folder_id IN (${folderIds.map(() => '?').join(',')})` : ''
  const rows = db.prepare(`
    SELECT chunks_fts.rowid AS chunk_id, bm25(chunks_fts) AS rank
    FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid JOIN documents d ON d.id = c.doc_id
    WHERE chunks_fts MATCH ? ${folderFilter}
    ORDER BY rank LIMIT ?`).all(match, ...(folderIds ?? []), limit)
  // bm25() is lower for better matches.
  return rows.map(row => ({ chunkId: row.chunk_id, score: -row.rank }))
}

/** Weighted reciprocal rank fusion. Returns `[{ chunkId, score }]`, best first. */
export function fuse(vectorHits, keywordHits) {
  const scores = new Map()
  vectorHits.forEach((hit, rank) => scores.set(hit.chunkId, (scores.get(hit.chunkId) ?? 0) + VECTOR_WEIGHT / (RRF_K + rank + 1)))
  keywordHits.forEach((hit, rank) => scores.set(hit.chunkId, (scores.get(hit.chunkId) ?? 0) + KEYWORD_WEIGHT / (RRF_K + rank + 1)))
  return [...scores].map(([chunkId, score]) => ({ chunkId, score })).sort((a, b) => b.score - a.score)
}

function tokenSet(text) {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
}

function jaccard(a, b) {
  let shared = 0
  for (const token of a) {
    if (b.has(token))
      shared++
  }
  const union = a.size + b.size - shared
  return union ? shared / union : 0
}

/** Picks `k` items that are relevant but not near-duplicates. Items need `score` and `content`. */
export function mmr(items, k, lambda = MMR_LAMBDA) {
  if (items.length <= 1)
    return items.slice(0, k)
  const top = items[0].score || 1
  const pool = items.map(item => ({ item, relevance: item.score / top, tokens: tokenSet(item.content) }))
  const chosen = []
  while (chosen.length < k && pool.length > 0) {
    let bestIndex = 0
    let bestValue = -Infinity
    pool.forEach((candidate, index) => {
      const redundancy = Math.max(0, ...chosen.map(picked => jaccard(candidate.tokens, picked.tokens)))
      const value = lambda * candidate.relevance - (1 - lambda) * redundancy
      if (value > bestValue) {
        bestValue = value
        bestIndex = index
      }
    })
    chosen.push(pool.splice(bestIndex, 1)[0])
  }
  return chosen.map(entry => entry.item)
}

/**
 * Hybrid search. `queryVectors` maps an embedding model to the query vector for that model,
 * and can be empty (keyword only). Returns chunks with their document, best first.
 */
export function hybridSearch(db, text, queryVectors, { folderIds, k = DEFAULT_RESULTS } = {}) {
  const fused = fuse(vectorSearch(db, queryVectors, { folderIds }), keywordSearch(db, text, { folderIds }))
  if (fused.length === 0)
    return []
  const ids = fused.map(hit => hit.chunkId)
  const rows = db.prepare(`
    SELECT c.id, c.chunk_type, c.header, c.content, d.path, d.rel, d.title, d.folder_id
    FROM chunks c JOIN documents d ON d.id = c.doc_id
    WHERE c.id IN (${ids.map(() => '?').join(',')})`).all(...ids)
  const byId = new Map(rows.map(row => [row.id, row]))
  const items = fused.filter(hit => byId.has(hit.chunkId)).map(hit => ({ ...byId.get(hit.chunkId), score: hit.score }))
  return mmr(items, k)
}
