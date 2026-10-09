#!/usr/bin/env node
// MCP server (stdio) that adds local folders to a WeKnora knowledge base and keeps them in sync.
// It only uploads from folders inside ALLOWED_ROOTS, and it only deletes documents that it uploaded.

import process from 'node:process'

// eslint-disable-next-line no-restricted-syntax -- Plain Node.js ESM needs the file extension.
import { startMcpServer } from '../shared/mcp-stdio.mjs'
// eslint-disable-next-line no-restricted-syntax -- Plain Node.js ESM needs the file extension.
import { addFolder, formatResult, listFolders, loadConfig, removeFolder, syncFolders } from './core.mjs'

const SERVER_INFO = { name: 'weknora-folders', version: '1.0.0' }
// One tool call must finish quickly. The scheduled CLI uploads whatever is left.
const MAX_UPLOADS_PER_CALL = 100

const config = loadConfig()

const tools = {
  add_folder: {
    description: `Thêm một thư mục trên máy vào kho tri thức WeKnora và nạp các file tài liệu (pdf, docx, pptx, xlsx, md, txt, csv, json, html, epub). Chỉ nhận thư mục nằm trong: ${config.allowedRoots.join(', ')}. Chỉ gọi khi người dùng yêu cầu rõ ràng.`,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Đường dẫn tuyệt đối, ví dụ "D:/workspace-AI-v2/docs"' },
        kb: { type: 'string', description: 'ID knowledge base. Bỏ trống để dùng KB mặc định.' },
      },
      required: ['path'],
    },
    run: async ({ path, kb }) => formatResult(await addFolder(config, path, kb, MAX_UPLOADS_PER_CALL)),
  },
  sync_folders: {
    description: 'Đồng bộ lại các thư mục đã thêm: nạp file mới hoặc đã sửa, xoá tài liệu của file đã bị xoá.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Chỉ đồng bộ thư mục này (tuỳ chọn)' } } },
    run: async ({ path }) => (await syncFolders(config, path, MAX_UPLOADS_PER_CALL)).map(formatResult).join('\n') || '(chưa có thư mục nào)',
  },
  list_folders: {
    description: 'Liệt kê các thư mục đang được đồng bộ vào WeKnora.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => (await listFolders(config))
      .map(folder => `${folder.folder} → KB ${folder.kbId}, ${folder.files} file, đồng bộ lần cuối ${folder.lastSync ?? 'chưa'}`)
      .join('\n') || '(chưa có thư mục nào)',
  },
  remove_folder: {
    description: 'Ngừng đồng bộ một thư mục. Tài liệu đã nạp vẫn giữ trong WeKnora.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    run: async ({ path }) => `Đã ngừng đồng bộ ${await removeFolder(config, path)}. Tài liệu cũ vẫn còn trong KB.`,
  },
}

startMcpServer({ info: SERVER_INFO, tools })

process.stderr.write(`[${SERVER_INFO.name}] ${config.baseUrl}, roots: ${config.allowedRoots.join('; ')}\n`)
