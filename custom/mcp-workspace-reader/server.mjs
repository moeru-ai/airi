#!/usr/bin/env node
// Read-only MCP server (stdio) that lets AIRI look at projects in one workspace folder.
// It has no write tools. AIRI runs MCP tools without approval, so this server must stay read-only.
// It has no dependencies, so it runs on any Node.js >= 20 without an install step.

import process from 'node:process'

import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'

// eslint-disable-next-line no-restricted-syntax -- Plain Node.js ESM needs the file extension.
import { startMcpServer, truncate as truncateText } from '../shared/mcp-stdio.mjs'
// eslint-disable-next-line no-restricted-syntax -- Plain Node.js ESM needs the file extension.
import { GIT_SECRET_EXCLUDES, isBlockedName, resolveInsideRoot } from '../shared/path-guard.mjs'

const execFileAsync = promisify(execFile)

const ROOT = resolve(process.env.WORKSPACE_ROOT ?? process.argv[2] ?? process.cwd())
const SERVER_INFO = { name: 'workspace-reader', version: '1.0.0' }
const MAX_FILE_BYTES = 200_000
const MAX_OUTPUT_CHARS = 50_000
const MAX_DIR_ENTRIES = 500
const DEFAULT_MAX_LINES = 400
const DEFAULT_LOG_COUNT = 15
const MAX_LOG_COUNT = 100
const GIT_TIMEOUT_MS = 10_000

function truncate(text, limit = MAX_OUTPUT_CHARS) {
  return truncateText(text, limit)
}

function resolveSafe(userPath = '.') {
  return resolveInsideRoot(ROOT, userPath)
}

async function git(projectPath, args) {
  const { real } = await resolveSafe(projectPath)
  const { stdout } = await execFileAsync('git', ['-C', real, ...args], { timeout: GIT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 })
  return truncate(stdout.trim() || '(trống)')
}

const tools = {
  list_projects: {
    description: 'Liệt kê các dự án (thư mục con) trong workspace, kèm nhánh git hiện tại nếu có.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const entries = await readdir(ROOT, { withFileTypes: true })
      const lines = await Promise.all(entries
        .filter(entry => entry.isDirectory() && !isBlockedName(entry.name))
        .map(async (entry) => {
          const branch = await execFileAsync('git', ['-C', join(ROOT, entry.name), 'branch', '--show-current'], { timeout: GIT_TIMEOUT_MS })
            .then(({ stdout }) => stdout.trim(), () => '')
          return branch ? `${entry.name} (nhánh: ${branch})` : entry.name
        }))
      return lines.join('\n') || '(không có dự án)'
    },
  },
  list_dir: {
    description: 'Liệt kê file và thư mục trong một đường dẫn (tương đối với workspace).',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Ví dụ: "airi/packages"' } }, required: ['path'] },
    async run({ path }) {
      const { real } = await resolveSafe(path)
      const entries = (await readdir(real, { withFileTypes: true })).filter(entry => !isBlockedName(entry.name))
      const lines = entries.slice(0, MAX_DIR_ENTRIES).map(entry => `${entry.isDirectory() ? '[dir] ' : ''}${entry.name}`)
      if (entries.length > MAX_DIR_ENTRIES)
        lines.push(`… còn ${entries.length - MAX_DIR_ENTRIES} mục`)
      return lines.join('\n') || '(thư mục trống)'
    },
  },
  read_file: {
    description: 'Đọc nội dung một file văn bản. Có thể chọn dòng bắt đầu và số dòng tối đa.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        startLine: { type: 'number', description: 'Dòng bắt đầu, tính từ 1' },
        maxLines: { type: 'number', description: `Mặc định ${DEFAULT_MAX_LINES}` },
      },
      required: ['path'],
    },
    async run({ path, startLine = 1, maxLines = DEFAULT_MAX_LINES }) {
      const { real, rel } = await resolveSafe(path)
      if ((await stat(real)).size > MAX_FILE_BYTES)
        throw new Error(`File lớn hơn ${MAX_FILE_BYTES} byte. Hãy đọc file khác hoặc dùng git_diff.`)
      const content = await readFile(real, 'utf8')
      if (content.includes('\0'))
        throw new Error('Đây là file nhị phân.')
      const lines = content.split(/\r?\n/)
      const from = Math.max(1, Math.floor(startLine))
      const slice = lines.slice(from - 1, from - 1 + Math.max(1, Math.floor(maxLines)))
      return truncate(`${rel} (dòng ${from}–${from + slice.length - 1} / ${lines.length})\n${slice.join('\n')}`)
    },
  },
  find_files: {
    description: 'Tìm file theo tên trong một dự án git (dùng git ls-files, không phân biệt hoa thường).',
    inputSchema: { type: 'object', properties: { project: { type: 'string' }, query: { type: 'string' } }, required: ['project', 'query'] },
    async run({ project, query }) {
      const files = (await git(project, ['ls-files'])).split('\n')
      const needle = String(query).toLowerCase()
      const matches = files.filter(file => file.toLowerCase().includes(needle) && !file.split('/').some(isBlockedName))
      return matches.slice(0, MAX_DIR_ENTRIES).join('\n') || '(không tìm thấy)'
    },
  },
  git_status: {
    description: 'Xem git status và nhánh hiện tại của một dự án.',
    inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] },
    run: ({ project }) => git(project, ['status', '--short', '--branch']),
  },
  git_log: {
    description: 'Xem các commit gần nhất của một dự án.',
    inputSchema: { type: 'object', properties: { project: { type: 'string' }, count: { type: 'number' } }, required: ['project'] },
    run: ({ project, count = DEFAULT_LOG_COUNT }) =>
      git(project, ['log', `-${Math.min(MAX_LOG_COUNT, Math.max(1, Math.floor(count)))}`, '--format=%h %ad %an: %s', '--date=short']),
  },
  git_diff: {
    description: 'Xem thay đổi chưa commit của một dự án (staged=true để xem phần đã stage).',
    inputSchema: { type: 'object', properties: { project: { type: 'string' }, staged: { type: 'boolean' } }, required: ['project'] },
    run: ({ project, staged = false }) => git(project, ['diff', ...(staged ? ['--staged'] : []), '--', '.', ...GIT_SECRET_EXCLUDES]),
  },
}

startMcpServer({ info: SERVER_INFO, tools })

process.stderr.write(`[${SERVER_INFO.name}] root: ${ROOT} (${basename(ROOT)})\n`)
