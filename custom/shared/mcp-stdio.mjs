// Minimal MCP server over stdio (newline-delimited JSON-RPC) for the custom servers.
// It supports initialize, ping, tools/list, and tools/call, which is all AIRI uses.

import process from 'node:process'

import { createInterface } from 'node:readline'

const DEFAULT_PROTOCOL_VERSION = '2025-06-18'

/**
 * Starts an MCP server on stdin and stdout.
 * `tools` maps a tool name to `{ description, inputSchema, run(args) => Promise<string> }`.
 */
export function startMcpServer({ info, tools }) {
  async function handle({ method, params }) {
    if (method === 'initialize')
      return { protocolVersion: params?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: info }
    if (method === 'ping')
      return {}
    if (method === 'tools/list')
      return { tools: Object.entries(tools).map(([name, tool]) => ({ name, description: tool.description, inputSchema: tool.inputSchema })) }
    if (method === 'tools/call') {
      const tool = tools[params?.name]
      if (!tool)
        throw Object.assign(new Error(`Không có tool ${params?.name}`), { code: -32602 })
      try {
        return { content: [{ type: 'text', text: await tool.run(params.arguments ?? {}) }] }
      }
      catch (error) {
        return { content: [{ type: 'text', text: `Lỗi: ${String(error?.message ?? error)}` }], isError: true }
      }
    }
    throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 })
  }

  function reply(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`)
  }

  createInterface({ input: process.stdin }).on('line', async (line) => {
    if (!line.trim())
      return
    let request
    try {
      request = JSON.parse(line)
    }
    catch {
      reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
      return
    }
    // Notifications have no id and need no reply.
    if (request.id === undefined)
      return
    try {
      reply({ jsonrpc: '2.0', id: request.id, result: await handle(request) })
    }
    catch (error) {
      reply({ jsonrpc: '2.0', id: request.id, error: { code: error.code ?? -32603, message: error.message } })
    }
  })
}

/** Cuts long tool output so one call cannot flood the model context. */
export function truncate(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)}\n… (đã cắt bớt, còn ${text.length - limit} ký tự)` : text
}
