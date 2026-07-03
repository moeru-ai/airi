/**
 * AIRI Core Terminal — MCP Client Bridge
 *
 * Spawns the anima-use-terminal MCP server as a child process and exposes
 * a Promise-based API on top of the MCP SDK Client. This keeps the PTY
 * server进程 lifecycle isolated from AIRI's capability registry.
 *
 * Design notes:
 * - Single bridge anima-use-terminal MCP SPI: one process, N tools.
 * - The MCP tool names (terminal_start, terminal_exec, ...) are stable, so
 *   we cache them at connect time and expose them for capability discovery.
 * - Errors from MCP tool calls are normalized to a { code, message } shape
 *   so the handler layer can wrap them into ToolExecutionResult uniformly.
 */

import process from 'node:process'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
// eslint-disable-next-line perfectionist/sort-imports
import type { StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

export interface TerminalMcpToolSummary {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface TerminalMcpBridgeOptions {
  /**
   * Executable + args that launches the MCP server. Defaults to
   * npx smart-terminal-mcp@stable.
   */
  command: string
  args: string[]
  env?: Record<string, string>
  cwd?: string
}

function defaultBridgeOptions(): TerminalMcpBridgeOptions {
  return {
    command: 'npx',
    args: ['-y', 'smart-terminal-mcp@stable'],
  }
}

export class TerminalMcpBridge {
  private readonly options: TerminalMcpBridgeOptions
  private readonly client: Client
  private readonly transport: StdioClientTransport
  private connected = false

  constructor(options: Partial<TerminalMcpBridgeOptions> = {}) {
    const merged = { ...defaultBridgeOptions(), ...options }
    this.options = merged

    const serverParams: StdioServerParameters = {
      command: merged.command,
      args: merged.args,
      env: merged.env,
      cwd: merged.cwd,
    }
    this.transport = new StdioClientTransport(serverParams)
    this.client = new Client({ name: 'airi-core-terminal', version: '0.1.0' }, { capabilities: {} })
  }

  /**
   * Spawn the MCP server subprocess, initialize the MCP session, and
   * enumerate the registered tools. Idempotent.
   */
  async connect(timeoutMs = 30_000): Promise<TerminalMcpToolSummary[]> {
    if (this.connected) return this.listTools()

    await this.withTimeout(
      this.client.connect(this.transport),
      timeoutMs,
      `MCP handshake with ${this.options.command} timed out after ${timeoutMs}ms`,
    )

    const listed = await this.withTimeout(
      this.client.listTools(),
      timeoutMs,
      `tools/list timed out after ${timeoutMs}ms`,
    )

    this.connected = true
    return listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
    }))
  }

  /**
   * Re-enumerate the tools the server currently advertises.
   */
  async listTools(): Promise<TerminalMcpToolSummary[]> {
    this.ensureConnected()
    const listed = await this.client.listTools()
    return listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
    }))
  }

  /**
   * Invoke a tool on the MCP server.
   *
   * @throws NormalizedToolError if the MCP server reports the call as an error.
   */
  async callTool(name: string, args: Record<string, unknown>, timeoutMs = 120_000): Promise<unknown> {
    this.ensureConnected()

    let result: Awaited<ReturnType<typeof this.client.callTool>>
    try {
      result = await this.withTimeout(
        this.client.callTool({ name, arguments: args }, undefined, {
          timeout: timeoutMs,
        }),
        timeoutMs,
        `tool call "${name}" timed out after ${timeoutMs}ms`,
      )
    } catch (error) {
      throwNormalizedBridgeError(error, name)
    }

    if (result.isError) {
      const message = extractErrorText(result as { content?: Array<{ type: string; text?: string }> })
      throwMcpToolError(message)
    }

    // Prefer structured content when available; fall back to content blocks.
    return result.structuredContent ?? result.content
  }

  /**
   * Close the MCP session and SIGTERM the subprocess. Safe to call multiple
   * times. Idempotent.
   */
  async close(): Promise<void> {
    if (!this.connected) return

    try {
      await this.client.close()
    } finally {
      this.connected = false
    }
  }

  get pid(): number | null {
    return this.transport.pid
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('TerminalMcpBridge is not connected. Call connect() first.')
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(message))
      }, timeoutMs)

      promise
        .then((value) => {
          clearTimeout(timer)
          resolve(value)
        })
        .catch((error) => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }
}

function throwMcpToolError(message: string): never {
  throw Object.assign(new Error(message), { code: 'MCP_TOOL_ERROR' })
}

function throwNormalizedBridgeError(error: unknown, toolName: string): never {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const anyErr = error as { code: unknown; message?: unknown }
    const message = typeof anyErr.message === 'string' ? anyErr.message : `Tool "${toolName}" failed`
    throw Object.assign(new Error(message), { code: String(anyErr.code) })
  }
  throw error instanceof Error ? error : new Error(`Tool "${toolName}" failed`)
}

function extractErrorText(result: { content?: Array<{ type: string; text?: string }> }): string {
  if (Array.isArray(result.content)) {
    const textParts = result.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
    if (textParts.length > 0) return textParts.join('\n')
  }
  return `Tool returned isError=true with no text content`
}

/**
 * Resolve the terminal MCP server path from the environment.
 *
 * Priority:
 * 1. process.env.AIRI_TERMINAL_MCP_PATH — explicit path (e.g. /path/to/src/index.js)
 * 2. Default — npx -y smart-terminal-mcp@stable
 */
export function resolveTerminalMcpOptions(): Partial<TerminalMcpBridgeOptions> {
  const explicit = process.env.AIRI_TERMINAL_MCP_PATH
  if (explicit && explicit.trim().length > 0) {
    // Treat as a Node script to spawn directly (no npx overhead).
    return { command: 'node', args: [explicit] }
  }
  return {}
}
