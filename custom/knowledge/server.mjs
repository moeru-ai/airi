#!/usr/bin/env node
// Knowledge MCP server (stdio): folder indexing, hybrid search, document reading, and the wiki.
// Configuration comes from the environment, set in AIRI's mcp.json:
//   ALLOWED_ROOTS      folders that can be added, separated by ";" (required)
//   VOYAGE_API_KEY     embeddings (optional: without it search is keyword-only)
//   ANTHROPIC_API_KEY  vision, document profiles, and wiki (optional)
//   KNOWLEDGE_DB, WIKI_DIR, EMBED_MODEL, EMBED_CODE_MODEL, VISION_MODEL, PROFILE_MODEL,
//   WIKI_MAP_MODEL, WIKI_REDUCE_MODEL (optional overrides)

/* eslint-disable no-restricted-syntax -- Plain Node.js ESM needs file extensions. */
import process from 'node:process'

import { join } from 'node:path'

import { startMcpServer } from '../shared/mcp-stdio.mjs'
import { openDatabase } from './db.mjs'
import { createEmbedder } from './embed.mjs'
import { createIndexer } from './ingest.mjs'
import { createLlm } from './llm.mjs'
import { createKnowledgeTools } from './tools.mjs'
import { createWikiTools } from './wiki-tools.mjs'

const SERVER_INFO = { name: 'knowledge', version: '1.0.0' }
const APP_DIR = join(process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config'), 'airi-custom')

const env = process.env
const roots = (env.ALLOWED_ROOTS ?? '').split(';').map(root => root.trim()).filter(Boolean)
if (roots.length === 0) {
  process.stderr.write('[knowledge] Thiếu ALLOWED_ROOTS (các thư mục cách nhau bởi dấu ;).\n')
  process.exit(1)
}

const models = {
  embed: env.EMBED_MODEL ?? 'voyage-3.5',
  embedCode: env.EMBED_CODE_MODEL ?? 'voyage-code-3',
  vision: env.VISION_MODEL ?? 'claude-haiku-5-5',
  profile: env.PROFILE_MODEL ?? 'claude-haiku-5-5',
  wikiMap: env.WIKI_MAP_MODEL ?? 'claude-haiku-5-5',
  wikiReduce: env.WIKI_REDUCE_MODEL ?? 'claude-sonnet-5-5',
}

const db = openDatabase(env.KNOWLEDGE_DB ?? join(APP_DIR, 'knowledge.db'))
const embedder = createEmbedder({ apiKey: env.VOYAGE_API_KEY, baseUrl: env.VOYAGE_BASE_URL })
const llm = createLlm({ apiKey: env.ANTHROPIC_API_KEY })
const wikiDir = env.WIKI_DIR ?? join(APP_DIR, 'wiki')
const indexer = createIndexer({ db, roots, embedder, llm, models })

// Jobs that were running when the server stopped will never finish. Mark them, so status stays honest.
db.prepare('UPDATE jobs SET status = \'interrupted\' WHERE status IN (\'queued\', \'running\')').run()

const context = { db, roots, embedder, indexer, llm, models, wikiDir }
startMcpServer({ info: SERVER_INFO, tools: { ...createKnowledgeTools(context), ...createWikiTools(context) } })

process.stderr.write(`[knowledge] roots: ${roots.join('; ')} | embedding: ${embedder ? models.embed : 'tắt (thiếu VOYAGE_API_KEY)'} | vision+wiki: ${llm ? 'bật' : 'tắt (thiếu ANTHROPIC_API_KEY)'}\n`)
