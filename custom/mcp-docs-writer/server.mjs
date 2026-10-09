#!/usr/bin/env node
// MCP server (stdio) that saves the documents the character writes as new Markdown files.

import process from 'node:process'

import { resolve } from 'node:path'

// eslint-disable-next-line no-restricted-syntax -- Plain Node.js ESM needs the file extension.
import { startMcpServer } from '../shared/mcp-stdio.mjs'
// eslint-disable-next-line no-restricted-syntax -- Plain Node.js ESM needs the file extension.
import { createDocsWriterTools } from './tools.mjs'

const SERVER_INFO = { name: 'docs-writer', version: '1.0.0' }
const DOCS_DIR = resolve(process.env.DOCS_DIR ?? process.argv[2] ?? 'mai-docs')

startMcpServer({ info: SERVER_INFO, tools: createDocsWriterTools(DOCS_DIR) })

process.stderr.write(`[${SERVER_INFO.name}] docs dir: ${DOCS_DIR}\n`)
