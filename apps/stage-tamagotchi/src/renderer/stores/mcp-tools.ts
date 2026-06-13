import type { McpToolRuntime } from '@proj-airi/stage-ui/tools/mcp'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { useLlmToolsetPromptsStore } from '@proj-airi/stage-ui/stores/llm-toolset-prompts'
import { createMcpToolset } from '@proj-airi/stage-ui/tools/mcp'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { electronMcpCallTool, electronMcpListTools } from '../../shared/eventa'

/**
 * Registers Electron-backed MCP tools into the shared LLM runtime with progressive disclosure:
 * every tool is advertised in an always-in-context awareness catalog, and a tool the model actually
 * uses is promoted to a native first-class tool whose ref is persisted, so it stays native across
 * restarts. See docs/superpowers/specs/2026-06-14-mcp-progressive-tool-registration-design.md.
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
  const toolsetPromptsStore = useLlmToolsetPromptsStore()
  const listMcpTools = useElectronEventaInvoke(electronMcpListTools)
  const callMcpTool = useElectronEventaInvoke(electronMcpCallTool)

  // Persisted MCP tool refs ("<server>::<tool>") promoted to native first-class tools. A tool the
  // model uses joins this set, so from the next refresh it is callable natively (progressive
  // disclosure); the rest stay one-liners in the awareness catalog.
  const activatedRefs = useLocalStorage<string[]>('settings/mcp/activated-tools', [])

  const runtime: McpToolRuntime = {
    listTools: () => listMcpTools(),
    callTool: payload => callMcpTool(payload),
  }

  function markToolActivated(ref: string) {
    if (!activatedRefs.value.includes(ref))
      activatedRefs.value = [...activatedRefs.value, ref]
  }

  /** Send an activated tool back to the cold catalog (drops its native registration). */
  function deactivate(ref: string) {
    activatedRefs.value = activatedRefs.value.filter(entry => entry !== ref)
  }

  /** Demote every activated tool back to the catalog. */
  function deactivateAll() {
    activatedRefs.value = []
  }

  async function refresh() {
    const { tools, catalog } = await createMcpToolset(runtime, {
      activatedRefs: new Set(activatedRefs.value),
      onToolInvoked: markToolActivated,
    })
    await llmToolsStore.registerTools('mcp', tools)
    toolsetPromptsStore.registerToolsetPrompts(
      'mcp',
      catalog ? [{ id: 'mcp-catalog', title: 'MCP tools', content: catalog }] : [],
    )
  }

  // Any change to the activated set re-derives the live toolset: a tool the model just used becomes
  // native from the next turn, and a manual (de)activation from the settings window — synced here via
  // localStorage — takes effect the same way. Startup is driven by an explicit refresh() from the host.
  watch(activatedRefs, () => void refresh())

  function dispose() {
    llmToolsStore.clearTools('mcp')
    toolsetPromptsStore.clearToolsetPrompts('mcp')
  }

  return {
    activatedRefs,
    deactivate,
    deactivateAll,
    dispose,
    refresh,
  }
})
