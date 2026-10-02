import type { AgentContext } from '@agentclientprotocol/sdk'

import type { AcpBridgeCapabilities, AcpBridgeToolCall } from './bridge'
import type { McpConnection } from './mcp'

import { methods } from '@agentclientprotocol/sdk'
import { errorMessageFrom } from '@moeru/std'

/** One ACP session the desktop application can call back into. */
export interface AcpClientCallHost {
  sessionId: string
  client: AgentContext
  capabilities: AcpBridgeCapabilities
  connections: McpConnection[]
}

/**
 * Runs one desktop tool call on the ACP Client or on an attached MCP server.
 *
 * A capability the ACP Client did not report returns text and does not call the ACP Client.
 */
export async function callAcpClientTool(host: AcpClientCallHost, call: AcpBridgeToolCall): Promise<string> {
  try {
    switch (call.name) {
      case 'read_text_file':
        return await readTextFile(host, call.arguments)
      case 'write_text_file':
        return await writeTextFile(host, call.arguments)
      case 'terminal':
        return await runTerminal(host, call.arguments)
      case 'mcp_list_tools':
        return listMcpTools(host)
      case 'mcp_call_tool':
        return await callMcpTool(host, call.arguments)
    }
  }
  catch (error) {
    return errorMessageFrom(error) ?? 'ACP Client tool failed'
  }
}

async function readTextFile(host: AcpClientCallHost, input: Record<string, unknown>) {
  if (!host.capabilities.readTextFile)
    return 'ACP Client did not provide file read'
  const args = await completeArguments(host, input, ['path'], {
    path: { type: 'string' },
  }, 'Read file')
  if (!args || typeof args.path !== 'string')
    return 'Tool call was not completed'
  const response = await host.client.request(methods.client.fs.readTextFile, {
    sessionId: host.sessionId,
    path: args.path,
    ...(typeof args.line === 'number' ? { line: args.line } : {}),
    ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
  })
  return response.content
}

async function writeTextFile(host: AcpClientCallHost, input: Record<string, unknown>) {
  if (!host.capabilities.writeTextFile)
    return 'ACP Client did not provide file write'
  const args = await completeArguments(host, input, ['path', 'content'], {
    path: { type: 'string' },
    content: { type: 'string' },
  }, 'Write file')
  if (!args || typeof args.path !== 'string' || typeof args.content !== 'string')
    return 'Tool call was not completed'
  await host.client.request(methods.client.fs.writeTextFile, {
    sessionId: host.sessionId,
    path: args.path,
    content: args.content,
  })
  return `Wrote ${args.path}`
}

async function runTerminal(host: AcpClientCallHost, input: Record<string, unknown>) {
  if (!host.capabilities.terminal)
    return 'ACP Client did not provide a terminal'
  const args = await completeArguments(host, input, ['command'], {
    command: { type: 'string' },
  }, 'Run terminal command')
  if (!args || typeof args.command !== 'string')
    return 'Tool call was not completed'
  const commandArgs = Array.isArray(args.args)
    ? args.args.filter((item): item is string => typeof item === 'string')
    : []
  const created = await host.client.request(methods.client.terminal.create, {
    sessionId: host.sessionId,
    command: args.command,
    args: commandArgs,
  })
  const exited = await host.client.request(methods.client.terminal.waitForExit, {
    sessionId: host.sessionId,
    terminalId: created.terminalId,
  })
  const output = await host.client.request(methods.client.terminal.output, {
    sessionId: host.sessionId,
    terminalId: created.terminalId,
  })
  await host.client.request(methods.client.terminal.release, {
    sessionId: host.sessionId,
    terminalId: created.terminalId,
  })
  return `exit ${exited.exitCode ?? 'null'}\n${output.output}`
}

function listMcpTools(host: AcpClientCallHost) {
  if (host.connections.length === 0)
    return 'ACP Client did not attach MCP servers'
  return JSON.stringify(host.connections.flatMap(connection => connection.tools.map(tool => ({
    name: `${connection.name}::${tool.name}`,
    description: tool.description ?? '',
  }))))
}

async function callMcpTool(host: AcpClientCallHost, input: Record<string, unknown>) {
  if (host.connections.length === 0)
    return 'ACP Client did not attach MCP servers'
  if (typeof input.name !== 'string')
    return 'MCP tool name is missing'
  const separator = input.name.indexOf('::')
  if (separator <= 0)
    return 'MCP tool name must use server::tool'
  const serverName = input.name.slice(0, separator)
  const toolName = input.name.slice(separator + 2)
  const connection = host.connections.find(item => item.name === serverName)
  const tool = connection?.tools.find(item => item.name === toolName)
  if (!tool)
    return `MCP tool ${input.name} is not available`
  const args = argumentsRecord(input.arguments)
  if (!args)
    return 'MCP tool arguments must be a JSON object'
  return tool.call(args)
}

async function completeArguments(
  host: AcpClientCallHost,
  input: Record<string, unknown>,
  required: string[],
  properties: Record<string, object>,
  title: string,
) {
  const missing = required.filter(key => input[key] == null || input[key] === '')
  if (missing.length === 0)
    return input
  if (!host.capabilities.elicitForm)
    return undefined
  const elicited = await elicit(host, `Provide ${missing.join(', ')} for ${title}`, missing, properties)
  if (!elicited)
    return undefined
  return { ...input, ...elicited }
}

async function elicit(
  host: AcpClientCallHost,
  message: string,
  required: string[],
  properties: Record<string, object>,
) {
  const response = await host.client.request(methods.client.elicitation.create, {
    mode: 'form',
    message,
    sessionId: host.sessionId,
    requestedSchema: {
      type: 'object',
      required,
      properties,
    },
  })
  if (response.action !== 'accept' || response.content == null)
    return undefined
  return response.content
}

function argumentsRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    try {
      return argumentsRecord(JSON.parse(value))
    }
    catch {
      return undefined
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined
  return value as Record<string, unknown>
}
