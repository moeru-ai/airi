#!/usr/bin/env node
// CLI: syncs every registered folder into WeKnora. Task Scheduler runs it on a timer.
// Without WEKNORA_API_KEY in the environment, it reads the `weknora-folders` env from AIRI's mcp.json.

import process from 'node:process'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// eslint-disable-next-line no-restricted-syntax -- Plain Node.js ESM needs the file extension.
import { formatResult, loadConfig, syncFolders } from './core.mjs'

const AIRI_MCP_CONFIG = join(process.env.APPDATA ?? '', '@proj-airi', 'stage-tamagotchi', 'mcp.json')

async function resolveEnv() {
  if (process.env.WEKNORA_API_KEY)
    return process.env
  const mcp = JSON.parse(await readFile(AIRI_MCP_CONFIG, 'utf8'))
  return { ...process.env, ...mcp.mcpServers?.['weknora-folders']?.env }
}

async function main() {
  try {
    const config = loadConfig(await resolveEnv())
    const results = await syncFolders(config, process.argv[2])
    console.info(`[${new Date().toISOString()}]`)
    console.info(results.map(formatResult).join('\n') || '(chưa có thư mục nào)')
    process.exitCode = results.some(result => result.errors?.length) ? 1 : 0
  }
  catch (error) {
    console.error(`[weknora-sync] ${String(error?.message ?? error)}`)
    process.exitCode = 1
  }
}

void main()
