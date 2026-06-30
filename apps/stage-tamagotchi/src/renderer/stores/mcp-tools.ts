import type { McpToolResult, McpToolSummary } from '@proj-airi/stage-ui/coding-workspace'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { createMcpTools } from '@proj-airi/stage-ui/tools/mcp'
import { defineStore } from 'pinia'

import type { ElectronMcpCallToolResult, ElectronMcpToolDescriptor } from '../../shared/eventa'
import { electronMcpCallTool, electronMcpListTools } from '../../shared/eventa'
import { useTamagotchiCodingWorkspaceStore } from './coding-workspace'

/**
 * Registers Electron-backed MCP tools into the shared LLM tools store.
 *
 * Use when:
 * - The Tamagotchi renderer needs live MCP tools during chat streaming
 *
 * Expects:
 * - Electron Eventa handlers for MCP listing and invocation are available
 *
 * Returns:
 * - Store actions for refreshing and disposing MCP runtime tools
 */
export const useTamagotchiMcpToolsStore = defineStore('tamagotchi-mcp-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const codingWorkspaceStore = useTamagotchiCodingWorkspaceStore()
  const listMcpTools = useElectronEventaInvoke(electronMcpListTools)
  const callMcpTool = useElectronEventaInvoke(electronMcpCallTool)

  async function listMcpToolsAndUpdateCodingBackend() {
    const tools = await listMcpTools()
    codingWorkspaceStore.updateMcpBackendStateFromTools(toCodingMcpToolSummaries(tools))
    return tools
  }

  async function callMcpToolFromCodingWorkspace(payload: {
    name: string
    arguments?: Record<string, unknown>
  }): Promise<McpToolResult> {
    return toCodingMcpToolResult(
      await callMcpTool({
        name: payload.name,
        arguments: payload.arguments,
      }),
    )
  }

  codingWorkspaceStore.setMcpRuntime({
    listMcpTools: async () => toCodingMcpToolSummaries(await listMcpToolsAndUpdateCodingBackend()),
    callMcpTool: callMcpToolFromCodingWorkspace,
  })

  async function refresh() {
    await listMcpToolsAndUpdateCodingBackend().catch(() => {
      codingWorkspaceStore.updateMcpBackendStateFromTools([])
    })

    return await llmToolsStore.registerTools(
      'mcp',
      Promise.all(
        createMcpTools({
          listTools: () => listMcpToolsAndUpdateCodingBackend(),
          callTool: (payload) => callMcpTool(payload),
        }),
      ),
    )
  }

  function dispose() {
    llmToolsStore.clearTools('mcp')
  }

  return {
    dispose,
    refresh,
  }
})

function toCodingMcpToolSummaries(tools: ElectronMcpToolDescriptor[]): McpToolSummary[] {
  return tools.map((tool) => ({
    description: tool.description,
    inputSchema: tool.inputSchema,
    name: tool.name,
    serverName: tool.serverName,
    toolName: tool.toolName,
  }))
}

function toCodingMcpToolResult(result: ElectronMcpCallToolResult): McpToolResult {
  return {
    content: result.content,
    isError: result.isError,
    structuredContent: result.structuredContent,
    toolResult: result.toolResult,
  }
}
