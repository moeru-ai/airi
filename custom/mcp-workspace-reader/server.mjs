#!/usr/bin/env node
// Read-only MCP server (stdio) that lets a client look at projects in one workspace folder.
// It has no dependencies, so it runs on any Node.js >= 20 without an install step.

import process from 'node:process'

import { basename, resolve } from 'node:path'

// eslint-disable-next-line no-restricted-syntax -- Plain Node.js ESM needs the file extension.
import { startMcpServer } from '../shared/mcp-stdio.mjs'
// eslint-disable-next-line no-restricted-syntax -- Plain Node.js ESM needs the file extension.
import { createWorkspaceReaderTools } from './tools.mjs'

const ROOT = resolve(process.env.WORKSPACE_ROOT ?? process.argv[2] ?? process.cwd())
const SERVER_INFO = { name: 'workspace-reader', version: '1.0.0' }

startMcpServer({ info: SERVER_INFO, tools: createWorkspaceReaderTools(ROOT) })

process.stderr.write(`[${SERVER_INFO.name}] root: ${ROOT} (${basename(ROOT)})\n`)
