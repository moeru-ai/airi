// Minimal MCP server for the custom servers. It supports initialize, ping, tools/list, and tools/call.
// `handleMcpMessage` is transport-free. The stdio loop here and the HTTP route in weknora-bridge both use it.

import process from 'node:process'

import { createInterface } from 'node:readline'

const DEFAULT_PROTOCOL_VERSION = '2025-06-18'

async function dispatch(info, tools, { method, params }) {
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

/**
 * Handles one JSON-RPC message.
 * `tools` maps a tool name to `{ description, inputSchema, run(args) => Promise<string> }`.
 * Returns the reply, or undefined for a notification, which needs no reply.
 */
export async function handleMcpMessage(info, tools, request) {
  if (request?.id === undefined)
    return undefined
  try {
    return { jsonrpc: '2.0', id: request.id, result: await dispatch(info, tools, request) }
  }
  catch (error) {
    return { jsonrpc: '2.0', id: request.id, error: { code: error.code ?? -32603, message: error.message } }
  }
}

/** Starts an MCP server on stdin and stdout (newline-delimited JSON-RPC). */
export function startMcpServer({ info, tools }) {
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
    const response = await handleMcpMessage(info, tools, request)
    if (response)
      reply(response)
  })
}

/** Cuts long tool output so one call cannot flood the model context. */
export function truncate(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)}\n… (đã cắt bớt, còn ${text.length - limit} ký tự)` : text
}
