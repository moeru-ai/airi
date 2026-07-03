import type {
  CodeIntelligenceTransport,
  CodingEngineId,
  CodingMode,
  CodingWorkspaceStatus,
  CodingWorkspaceToolRuntime,
  McpBackendState,
  McpToolCall,
  McpToolResult,
  McpToolSummary,
  SpecEntryPath,
  SpecModeState,
  SubagentJobStore,
  UpdateSpecArtifactInput,
} from '@proj-airi/stage-ui/coding-workspace'
import {
  createCodeIntelligenceFacade,
  createCodingWorkspaceTools,
  createCodingWorkspaceToolsetPrompts,
  createSpecModeState,
  createSubagentJobStore,
  isSerenaReadOnlyTool,
} from '@proj-airi/stage-ui/coding-workspace'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { useLlmToolsetPromptsStore } from '@proj-airi/stage-ui/stores/llm-toolset-prompts'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

export const TAMAGOTCHI_CODING_WORKSPACE_PROVIDER = 'coding-workspace'

export type TamagotchiCodingEngineId = Extract<CodingEngineId, 'native'>

interface NormalizedMcpToolSummary {
  name: string
  serverName?: string
  toolName: string
  original: McpToolSummary
}

const unavailableMcpRuntime: CodeIntelligenceTransport = {
  async listMcpTools() {
    return []
  },
  async callMcpTool(input: McpToolCall): Promise<McpToolResult> {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `MCP runtime is unavailable for "${input.name}".`,
        },
      ],
    }
  },
}

export function inferCodingWorkspaceMcpBackendState(tools: readonly McpToolSummary[]): McpBackendState {
  const normalizedTools = tools
    .map(normalizeMcpToolSummary)
    .filter((tool): tool is NormalizedMcpToolSummary => tool != null)

  if (normalizedTools.length === 0) {
    return 'unavailable'
  }

  const readOnlySerenaGroups = new Map<string, NormalizedMcpToolSummary[]>()
  for (const tool of normalizedTools) {
    if (!isSerenaReadOnlyTool(tool.toolName)) {
      continue
    }

    const groupKey = tool.serverName ?? inferServerNameFromQualifiedName(tool.name) ?? '__unknown_serena__'
    readOnlySerenaGroups.set(groupKey, [...(readOnlySerenaGroups.get(groupKey) ?? []), tool])
  }

  const hasSerenaBackend = [...readOnlySerenaGroups.values()].some((group) => {
    return distinctReadOnlySerenaToolCount(group) >= 2 || group.some(containsSerenaHint)
  })

  return hasSerenaBackend ? 'serena' : 'available'
}

export const useTamagotchiCodingWorkspaceStore = defineStore('tamagotchi-coding-workspace', () => {
  const llmToolsStore = useLlmToolsStore()
  const llmToolsetPromptsStore = useLlmToolsetPromptsStore()
  const activeWorkspaceRoot = ref<string | undefined>()
  const codingContextEnabled = ref(false)
  const codingMode = ref<CodingMode>('ask')
  const specEntryPath = ref<SpecEntryPath>('requirements-first')
  const engine = ref<TamagotchiCodingEngineId>('native')
  const mcpBackendState = ref<McpBackendState>('unavailable')
  const lastMcpTools = ref<McpToolSummary[]>([])
  const activeSpecFeatureSlug = ref<string | undefined>()
  const subagentJobStore = ref<SubagentJobStore>(createSubagentJobStore())
  const mcpRuntime = shallowRef<CodeIntelligenceTransport>(unavailableMcpRuntime)

  const serenaAvailable = computed(() => mcpBackendState.value === 'serena')

  const specModeState = computed<SpecModeState | undefined>(() => {
    if (!activeSpecFeatureSlug.value) {
      return undefined
    }

    return createSpecModeState({
      featureSlug: activeSpecFeatureSlug.value,
      entryPath: specEntryPath.value,
    })
  })

  const status = computed<
    CodingWorkspaceStatus & {
      codingContextEnabled: boolean
      engine: TamagotchiCodingEngineId
      specEntryPath: SpecEntryPath
    }
  >(() => ({
    activeFeatureSlug: specModeState.value?.activeFeatureSlug,
    codingContextEnabled: codingContextEnabled.value,
    engine: engine.value,
    mcpBackend: mcpBackendState.value,
    mode: codingMode.value,
    specEntryPath: specEntryPath.value,
    workspaceRoot: activeWorkspaceRoot.value,
  }))

  function setMcpRuntime(runtime: CodeIntelligenceTransport) {
    mcpRuntime.value = runtime
  }

  function setActiveWorkspaceRoot(root: string | undefined) {
    const normalizedRoot = root?.trim()
    activeWorkspaceRoot.value = normalizedRoot || undefined
  }

  function setCodingMode(mode: CodingMode) {
    codingMode.value = mode
  }

  function setSpecEntryPath(entryPath: SpecEntryPath) {
    specEntryPath.value = entryPath
  }

  function setActiveSpecFeatureSlug(featureSlug: string | undefined) {
    const normalizedSlug = featureSlug?.trim()
    activeSpecFeatureSlug.value = normalizedSlug || undefined
  }

  function updateMcpBackendStateFromTools(tools: readonly McpToolSummary[]) {
    lastMcpTools.value = [...tools]
    mcpBackendState.value = inferCodingWorkspaceMcpBackendState(tools)
  }

  async function setCodingContextEnabled(enabled: boolean) {
    codingContextEnabled.value = enabled
    return await refresh()
  }

  async function refresh() {
    if (!codingContextEnabled.value) {
      clearRegistrations()
      return []
    }

    llmToolsetPromptsStore.registerToolsetPrompts(
      TAMAGOTCHI_CODING_WORKSPACE_PROVIDER,
      createCodingWorkspaceToolsetPrompts(),
    )

    return await llmToolsStore.registerTools(
      TAMAGOTCHI_CODING_WORKSPACE_PROVIDER,
      createCodingWorkspaceTools(createToolRuntime()),
    )
  }

  function dispose() {
    codingContextEnabled.value = false
    clearRegistrations()
  }

  function clearRegistrations() {
    llmToolsStore.clearTools(TAMAGOTCHI_CODING_WORKSPACE_PROVIDER)
    llmToolsetPromptsStore.clearToolsetPrompts(TAMAGOTCHI_CODING_WORKSPACE_PROVIDER)
  }

  function createToolRuntime(): CodingWorkspaceToolRuntime {
    return {
      codeIntelligence: createCodeIntelligenceFacade({
        callMcpTool: (input) => mcpRuntime.value.callMcpTool(input),
        listMcpTools: () => mcpRuntime.value.listMcpTools(),
        searchFiles: mcpRuntime.value.searchFiles
          ? (input) => mcpRuntime.value.searchFiles?.(input) ?? Promise.resolve([])
          : undefined,
      }),
      getMode: () => codingMode.value,
      getSpecModeState: () => specModeState.value,
      getStatus: () => status.value,
      getSubagentStore: () => subagentJobStore.value,
      setSubagentStore: (store) => {
        subagentJobStore.value = store
      },
      updateSpecArtifact: (input: UpdateSpecArtifactInput) => {
        throw new Error(`Spec artifact persistence is not connected in this renderer session: ${input.path}`)
      },
    }
  }

  return {
    activeSpecFeatureSlug,
    activeWorkspaceRoot,
    codingContextEnabled,
    codingMode,
    dispose,
    engine,
    lastMcpTools,
    mcpBackendState,
    refresh,
    serenaAvailable,
    setActiveSpecFeatureSlug,
    setActiveWorkspaceRoot,
    setCodingContextEnabled,
    setCodingMode,
    setMcpRuntime,
    setSpecEntryPath,
    specEntryPath,
    specModeState,
    status,
    subagentJobStore,
    updateMcpBackendStateFromTools,
  }
})

function normalizeMcpToolSummary(tool: McpToolSummary): NormalizedMcpToolSummary | undefined {
  const qualifiedName = readString(tool, 'name', 'id')
  const toolName = readString(tool, 'toolName', 'tool', 'functionName') ?? inferToolNameFromQualifiedName(qualifiedName)
  const serverName =
    readString(tool, 'serverName', 'server', 'serverId') ?? inferServerNameFromQualifiedName(qualifiedName)

  if (!toolName && !qualifiedName) {
    return undefined
  }

  const name = qualifiedName ?? toolName
  if (!name) {
    return undefined
  }

  return {
    name,
    original: tool,
    serverName,
    toolName: toolName ?? name,
  }
}

function distinctReadOnlySerenaToolCount(group: NormalizedMcpToolSummary[]): number {
  return new Set(group.map((tool) => tool.toolName).filter(isSerenaReadOnlyTool)).size
}

function containsSerenaHint(tool: NormalizedMcpToolSummary): boolean {
  return [tool.serverName, tool.name, readString(tool.original, 'server', 'serverId')]
    .filter((value): value is string => value != null)
    .some((value) => value.toLowerCase().includes('serena'))
}

function inferToolNameFromQualifiedName(name?: string): string | undefined {
  const separator = findQualifiedNameSeparator(name)
  return separator ? name?.slice(separator.index + separator.value.length) : name
}

function inferServerNameFromQualifiedName(name?: string): string | undefined {
  const separator = findQualifiedNameSeparator(name)
  return separator ? name?.slice(0, separator.index) : undefined
}

function findQualifiedNameSeparator(name?: string): { value: string; index: number } | undefined {
  if (!name) {
    return undefined
  }

  const separators = ['::', '/']
  for (const value of separators) {
    const index = name.indexOf(value)
    if (index > 0 && index < name.length - value.length) {
      return { value, index }
    }
  }

  return undefined
}

function readString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return undefined
}
