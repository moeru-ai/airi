export interface ModuleRuntimePrepareInput {
  moduleName: string
  config: Record<string, unknown>
}

export interface ModuleRuntimePrepareResult {
  websocketUrl?: string
  running?: boolean
  ready?: boolean
  error?: string
}
export interface ModuleRuntimeLogEntry {
  id: number
  at: string
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
}
export interface ModuleRuntimeFetchLogsInput {
  moduleName: string
  afterId?: number
  limit?: number
}
export interface ModuleRuntimeFetchLogsResult {
  logs: ModuleRuntimeLogEntry[]
  running?: boolean
  pid?: number | null
}

type ModuleRuntimePrepareHandler = (input: ModuleRuntimePrepareInput) => Promise<ModuleRuntimePrepareResult | void> | ModuleRuntimePrepareResult | void
type ModuleRuntimeFetchLogsHandler = (input: ModuleRuntimeFetchLogsInput) => Promise<ModuleRuntimeFetchLogsResult | void> | ModuleRuntimeFetchLogsResult | void

let moduleRuntimePrepareHandler: ModuleRuntimePrepareHandler | null = null
let moduleRuntimeFetchLogsHandler: ModuleRuntimeFetchLogsHandler | null = null

export function setModuleRuntimePrepareHandler(handler: ModuleRuntimePrepareHandler) {
  moduleRuntimePrepareHandler = handler
}

export function setModuleRuntimeFetchLogsHandler(handler: ModuleRuntimeFetchLogsHandler) {
  moduleRuntimeFetchLogsHandler = handler
}

export function clearModuleRuntimePrepareHandler() {
  moduleRuntimePrepareHandler = null
  moduleRuntimeFetchLogsHandler = null
}

export async function prepareModuleRuntime(input: ModuleRuntimePrepareInput): Promise<ModuleRuntimePrepareResult | void> {
  if (!moduleRuntimePrepareHandler)
    return

  return await moduleRuntimePrepareHandler(input)
}

export async function fetchModuleRuntimeLogs(input: ModuleRuntimeFetchLogsInput): Promise<ModuleRuntimeFetchLogsResult | void> {
  if (!moduleRuntimeFetchLogsHandler)
    return

  return await moduleRuntimeFetchLogsHandler(input)
}
