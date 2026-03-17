import type { ContextUpdate, WebSocketBaseEvent } from '@proj-airi/server-sdk'

import { Format, LogLevel, useLogg } from '@guiiai/logg'
import {
  moduleConfigurationCommit,
  moduleConfigurationCommitStatus,
  moduleConfigurationConfigured,
  moduleConfigurationPlanRequest,
  moduleConfigurationPlanResponse,
  moduleConfigurationPlanStatus,
  moduleConfigurationValidateRequest,
  moduleConfigurationValidateResponse,
  moduleConfigurationValidateStatus,
} from '@proj-airi/plugin-protocol/types'
import { Client, ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/utils-chat'

const VSCODE_BRIDGE_PLUGIN_ID = 'proj-airi:vscode-airi'
const VSCODE_HOST_PLUGIN_ID = 'proj-airi:airi-plugin-vscode'
const VSCODE_ACTIVITY_KIND = 'vscode:activity'
const AGGREGATED_CONTEXT_ID = 'vscode:activity:aggregate'

const CONFIG_SCHEMA_ID = 'airi.config.airi-plugin-vscode'
const CONFIG_SCHEMA_VERSION = 1

export interface ConfiguredModel {
  provider?: string
  model?: string
  baseURL?: string
  apiKey?: string
}

export interface VscodeAggregatorConfig {
  emitIntervalMs: number
  maxWorkspaces: number
  maxInstances: number
  model?: ConfiguredModel
  channelUrl?: string
}

export interface VscodeActivityPayload {
  kind: typeof VSCODE_ACTIVITY_KIND
  eventType: 'heartbeat' | 'save' | 'switch-file'
  instanceId: string
  workspaceFolder?: string
  workspaceFolders?: string[]
  filePath?: string
  languageId?: string
  cursor?: {
    line: number
    character: number
  }
  timestamp: number
}

interface VscodeInstanceState {
  instanceId: string
  workspaceFolder?: string
  workspaceFolders: string[]
  lastFilePath?: string
  lastLanguageId?: string
  lastCursor?: {
    line: number
    character: number
  }
  lastEventType: VscodeActivityPayload['eventType']
  firstSeenAt: number
  lastSeenAt: number
  updates: number
  saveCount: number
  switchFileCount: number
  heartbeatCount: number
}

const defaultConfig: VscodeAggregatorConfig = {
  emitIntervalMs: 5_000,
  maxWorkspaces: 12,
  maxInstances: 32,
}
const defaultChannelUrls = ['wss://localhost:6121/ws', 'ws://localhost:6121/ws']
const channelErrorLogThrottleMs = 15_000

const log = useLogg('airi-plugin-vscode').withLogLevel(LogLevel.Log).withFormat(Format.Pretty)

function createEventId() {
  return `vscode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null)
    return undefined

  return value as Record<string, unknown>
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []

  return value.filter((entry): entry is string => typeof entry === 'string')
}

function parseActivityPayload(event: WebSocketBaseEvent<'context:update', ContextUpdate>): VscodeActivityPayload | null {
  const sourcePluginId = event.metadata?.source?.plugin?.id
  if (sourcePluginId !== VSCODE_BRIDGE_PLUGIN_ID)
    return null

  const metadata = asObject(event.data.metadata)
  if (!metadata)
    return null

  if (metadata.kind !== VSCODE_ACTIVITY_KIND)
    return null

  const eventType = metadata.eventType
  if (eventType !== 'heartbeat' && eventType !== 'save' && eventType !== 'switch-file')
    return null

  const instanceId = metadata.instanceId
  if (typeof instanceId !== 'string' || instanceId.length === 0)
    return null

  const cursor = asObject(metadata.cursor)
  const parsedCursor = cursor && typeof cursor.line === 'number' && typeof cursor.character === 'number'
    ? { line: cursor.line, character: cursor.character }
    : undefined

  return {
    kind: VSCODE_ACTIVITY_KIND,
    eventType,
    instanceId,
    workspaceFolder: typeof metadata.workspaceFolder === 'string' ? metadata.workspaceFolder : undefined,
    workspaceFolders: toStringArray(metadata.workspaceFolders),
    filePath: typeof metadata.filePath === 'string' ? metadata.filePath : undefined,
    languageId: typeof metadata.languageId === 'string' ? metadata.languageId : undefined,
    cursor: parsedCursor,
    timestamp: typeof metadata.timestamp === 'number' ? metadata.timestamp : Date.now(),
  }
}

// ── Aggregator state ──────────────────────────────────────────────

const instances = new Map<string, VscodeInstanceState>()
const config: VscodeAggregatorConfig = { ...defaultConfig }
let timer: ReturnType<typeof setInterval> | null = null
let client: Client | null = null
let clientChannelKey = ''
let configured = false
let lastChannelErrorLogAt = 0

// ── Plugin-sdk lifecycle ──────────────────────────────────────────

export async function init({ channels }: { channels: { host: any }, apis: any }) {
  const hostChannel = channels.host

  // ── Validate handler ────────────────────────────────────────────
  hostChannel.on(moduleConfigurationValidateRequest, (payload: any) => {
    const identity = payload.identity
    const full = asObject(payload.current?.full)
    const modelConfig = asObject(full?.model)

    const missing: string[] = []
    if (!modelConfig?.baseURL)
      missing.push('model.baseURL')
    if (!modelConfig?.apiKey)
      missing.push('model.apiKey')
    if (!modelConfig?.model)
      missing.push('model.model')

    hostChannel.emit(moduleConfigurationValidateStatus, {
      identity,
      state: 'done',
    })

    hostChannel.emit(moduleConfigurationValidateResponse, {
      identity,
      validation: missing.length === 0
        ? { status: 'valid' as const }
        : { status: 'partial' as const, missing },
      current: payload.current,
    })
  })

  // ── Plan handler ────────────────────────────────────────────────
  hostChannel.on(moduleConfigurationPlanRequest, (payload: any) => {
    const identity = payload.identity
    const full = asObject(payload.current?.full)
    const modelConfig = asObject(full?.model)

    const missing: string[] = []
    if (!modelConfig?.baseURL)
      missing.push('model.baseURL')
    if (!modelConfig?.apiKey)
      missing.push('model.apiKey')
    if (!modelConfig?.model)
      missing.push('model.model')

    hostChannel.emit(moduleConfigurationPlanStatus, {
      identity,
      state: 'done',
    })

    hostChannel.emit(moduleConfigurationPlanResponse, {
      identity,
      plan: {
        schema: {
          id: CONFIG_SCHEMA_ID,
          version: CONFIG_SCHEMA_VERSION,
          schema: {
            type: 'object',
            properties: {
              channel: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                },
              },
              model: {
                type: 'object',
                properties: {
                  provider: { type: 'string' },
                  model: { type: 'string' },
                  baseURL: { type: 'string' },
                  apiKey: { type: 'string' },
                },
                required: ['model', 'baseURL', 'apiKey'],
              },
            },
          },
        },
        missing: missing.length > 0 ? missing : undefined,
        nextSteps: missing.length > 0
          ? missing.map(field => `Provide ${field} via the consciousness configuration panel.`)
          : undefined,
      },
      current: payload.current,
    })
  })

  // ── Commit handler ──────────────────────────────────────────────
  hostChannel.on(moduleConfigurationCommit, (payload: any) => {
    const identity = payload.identity
    const envelope = payload.config
    applyEnvelopeConfig(envelope)

    connectAndStart()

    hostChannel.emit(moduleConfigurationCommitStatus, {
      identity,
      state: 'done',
    })

    hostChannel.emit(moduleConfigurationConfigured, {
      identity,
      config: envelope,
    })
  })

  // ── Runtime re-configuration via WebSocket ──────────────────────
  // ── Initial config from plugin-host lifecycle ───────────────────
  hostChannel.on(moduleConfigurationConfigured, (payload: any) => {
    applyEnvelopeConfig(payload.config)
    connectAndStart()
  })
}

export async function setupModules() {
  if (configured) {
    await emitSummaryContextUpdate()
  }
}

// ── Connection & timer management ─────────────────────────────────

function connectAndStart() {
  const activeClient = ensureClient()
  if (!activeClient)
    return

  if (!configured) {
    activeClient.onEvent('context:update', (event) => {
      const payload = parseActivityPayload(event)
      if (!payload)
        return

      ingest(payload)
    })

    activeClient.connect().catch((err) => {
      log.withError(err).warn('failed to connect')
    })

    configured = true
  }

  startTimer()
  broadcastModelConfig()
}

function startTimer() {
  stopTimer()
  timer = setInterval(() => {
    void emitSummaryContextUpdate()
  }, config.emitIntervalMs)
}

function stopTimer() {
  if (!timer)
    return

  clearInterval(timer)
  timer = null
}

// ── Runtime re-configuration (via WebSocket module:configure) ─────

function applyRuntimeConfig(event: WebSocketBaseEvent<'module:configure', { config?: Record<string, unknown> }>) {
  const raw = asObject(event.data?.config)
  if (!raw)
    return

  if (typeof raw.emitIntervalMs === 'number' && Number.isFinite(raw.emitIntervalMs) && raw.emitIntervalMs >= 1_000) {
    config.emitIntervalMs = raw.emitIntervalMs
    startTimer()
  }

  if (typeof raw.maxWorkspaces === 'number' && Number.isFinite(raw.maxWorkspaces) && raw.maxWorkspaces >= 1) {
    config.maxWorkspaces = Math.floor(raw.maxWorkspaces)
  }

  if (typeof raw.maxInstances === 'number' && Number.isFinite(raw.maxInstances) && raw.maxInstances >= 1) {
    config.maxInstances = Math.floor(raw.maxInstances)
  }

  const modelObj = asObject(raw.model)
  if (modelObj) {
    config.model = {
      provider: typeof modelObj.provider === 'string' ? modelObj.provider : config.model?.provider,
      model: typeof modelObj.model === 'string' ? modelObj.model : config.model?.model,
      baseURL: typeof modelObj.baseURL === 'string' ? modelObj.baseURL : config.model?.baseURL,
      apiKey: typeof modelObj.apiKey === 'string' ? modelObj.apiKey : config.model?.apiKey,
    }
  }

  const channelObj = asObject(raw.channel)
  if (channelObj) {
    const previousChannelKey = clientChannelKey
    config.channelUrl = normalizeChannelUrl(channelObj.url)
    ensureClient()
    if (previousChannelKey !== clientChannelKey) {
      connectAndStart()
      return
    }
  }

  broadcastModelConfig()
  void emitSummaryContextUpdate()
}

function normalizeChannelUrl(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined

  const trimmed = value.trim()
  if (!trimmed.startsWith('ws://') && !trimmed.startsWith('wss://'))
    return undefined

  return trimmed
}

function getChannelUrls() {
  if (config.channelUrl)
    return [config.channelUrl]

  return [...defaultChannelUrls]
}

function createChannelClient(urls: string[]) {
  const createdClient = new Client({
    // NOTICE: `@proj-airi/server-sdk` currently publishes `url` as `string` in its exposed typings
    // while this workspace implementation supports fallback URL arrays at runtime.
    // Keep this cast until package exports are regenerated.
    url: urls as unknown as string,
    name: VSCODE_HOST_PLUGIN_ID,
    identity: {
      kind: 'plugin',
      id: `${VSCODE_HOST_PLUGIN_ID}:${createEventId()}`,
      plugin: {
        id: VSCODE_HOST_PLUGIN_ID,
      },
    },
    possibleEvents: ['context:update', 'module:configure', 'module:authenticated', 'registry:modules:sync'],
    onError: (error) => {
      const now = Date.now()
      if (now - lastChannelErrorLogAt >= channelErrorLogThrottleMs) {
        lastChannelErrorLogAt = now
        log.withError(error).warn('channel error')
      }
    },
    onClose: () => {
      stopTimer()
    },
    autoConnect: false,
  })

  // When the server-runtime forwards `module:configure` (translated from `ui:configure`)
  createdClient.onEvent('module:configure', (event) => {
    applyRuntimeConfig(event)
  })

  return createdClient
}

function ensureClient() {
  const urls = getChannelUrls()
  const nextChannelKey = urls.join('|')
  if (client && clientChannelKey === nextChannelKey)
    return client

  if (client) {
    client.close()
    configured = false
  }

  client = createChannelClient(urls)
  clientChannelKey = nextChannelKey
  return client
}

function applyEnvelopeConfig(envelope: unknown) {
  const full = asObject(asObject(envelope)?.full)
  const modelConfig = asObject(full?.model)

  if (modelConfig) {
    config.model = {
      provider: typeof modelConfig.provider === 'string' ? modelConfig.provider : undefined,
      model: typeof modelConfig.model === 'string' ? modelConfig.model : undefined,
      baseURL: typeof modelConfig.baseURL === 'string' ? modelConfig.baseURL : undefined,
      apiKey: typeof modelConfig.apiKey === 'string' ? modelConfig.apiKey : undefined,
    }
  }

  const channelConfig = asObject(full?.channel)
  if (channelConfig) {
    config.channelUrl = normalizeChannelUrl(channelConfig.url)
  }
}

// ── Ingestion ─────────────────────────────────────────────────────

function ingest(payload: VscodeActivityPayload) {
  const existing = instances.get(payload.instanceId)
  const state: VscodeInstanceState = existing ?? {
    instanceId: payload.instanceId,
    workspaceFolder: payload.workspaceFolder,
    workspaceFolders: payload.workspaceFolders ?? [],
    lastFilePath: payload.filePath,
    lastLanguageId: payload.languageId,
    lastCursor: payload.cursor,
    lastEventType: payload.eventType,
    firstSeenAt: payload.timestamp,
    lastSeenAt: payload.timestamp,
    updates: 0,
    saveCount: 0,
    switchFileCount: 0,
    heartbeatCount: 0,
  }

  state.workspaceFolder = payload.workspaceFolder ?? state.workspaceFolder
  state.workspaceFolders = payload.workspaceFolders?.length ? payload.workspaceFolders : state.workspaceFolders
  state.lastFilePath = payload.filePath ?? state.lastFilePath
  state.lastLanguageId = payload.languageId ?? state.lastLanguageId
  state.lastCursor = payload.cursor ?? state.lastCursor
  state.lastEventType = payload.eventType
  state.lastSeenAt = payload.timestamp
  state.updates += 1

  if (payload.eventType === 'save')
    state.saveCount += 1
  else if (payload.eventType === 'switch-file')
    state.switchFileCount += 1
  else
    state.heartbeatCount += 1

  instances.set(payload.instanceId, state)

  if (instances.size > config.maxInstances) {
    const stale = [...instances.values()].sort((a, b) => a.lastSeenAt - b.lastSeenAt)
    const overflow = instances.size - config.maxInstances
    for (const candidate of stale.slice(0, overflow)) {
      instances.delete(candidate.instanceId)
    }
  }
}

// ── LLM-based summary generation ─────────────────────────────────

function collectStructuredData(now: number) {
  const byWorkspace = new Map<string, {
    workspace: string
    activeInstances: number
    updates: number
    saveCount: number
    switchFileCount: number
    heartbeatCount: number
    lastSeenAt: number
    languages: Map<string, number>
    recentFiles: string[]
  }>()

  for (const instance of instances.values()) {
    const workspace = instance.workspaceFolder ?? '(no-workspace)'
    const entry = byWorkspace.get(workspace) ?? {
      workspace,
      activeInstances: 0,
      updates: 0,
      saveCount: 0,
      switchFileCount: 0,
      heartbeatCount: 0,
      lastSeenAt: 0,
      languages: new Map<string, number>(),
      recentFiles: [],
    }

    entry.activeInstances += 1
    entry.updates += instance.updates
    entry.saveCount += instance.saveCount
    entry.switchFileCount += instance.switchFileCount
    entry.heartbeatCount += instance.heartbeatCount
    entry.lastSeenAt = Math.max(entry.lastSeenAt, instance.lastSeenAt)

    if (instance.lastLanguageId) {
      entry.languages.set(instance.lastLanguageId, (entry.languages.get(instance.lastLanguageId) ?? 0) + 1)
    }

    if (instance.lastFilePath && !entry.recentFiles.includes(instance.lastFilePath)) {
      entry.recentFiles.push(instance.lastFilePath)
    }

    byWorkspace.set(workspace, entry)
  }

  const sortedWorkspaces = [...byWorkspace.values()]
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, config.maxWorkspaces)

  return {
    totalInstances: instances.size,
    workspaces: sortedWorkspaces.map(ws => ({
      workspace: ws.workspace,
      activeInstances: ws.activeInstances,
      updates: ws.updates,
      saveCount: ws.saveCount,
      switchFileCount: ws.switchFileCount,
      heartbeatCount: ws.heartbeatCount,
      lastSeenAt: new Date(ws.lastSeenAt).toISOString(),
      languages: [...ws.languages.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count })),
      recentFiles: ws.recentFiles.slice(0, 5),
    })),
    generatedAt: new Date(now).toISOString(),
  }
}

async function generateSummary(): Promise<string | null> {
  const model = config.model
  if (!model?.baseURL || !model?.apiKey || !model?.model) {
    return null
  }

  const now = Date.now()
  const data = collectStructuredData(now)

  if (data.totalInstances === 0) {
    return 'No active VS Code instances detected.'
  }

  try {
    const result = await generateText({
      baseURL: model.baseURL,
      apiKey: model.apiKey,
      model: model.model,
      messages: message.messages(
        message.system(
          'You are a concise developer-activity summarizer. '
          + 'Given structured data about VS Code editor activity (workspaces, files, languages, save/switch counts, timestamps), '
          + 'produce a brief, natural-language summary (2-5 sentences) describing what the developer is currently working on. '
          + 'Focus on: which projects are active, what languages/files are being edited, and the intensity of activity. '
          + 'Do NOT mention technical details like instance IDs or raw counts — instead describe the activity qualitatively. '
          + 'Write in third person (e.g., "The developer is…").',
        ),
        message.user(JSON.stringify(data)),
      ),
    })

    return result.text ?? null
  }
  catch (err) {
    console.warn('[airi-plugin-vscode] LLM summary generation failed:', err)
    return null
  }
}

async function emitSummaryContextUpdate() {
  if (!client)
    return

  const summary = await generateSummary()
  if (summary == null)
    return

  client.send({
    type: 'context:update',
    data: {
      id: createEventId(),
      contextId: AGGREGATED_CONTEXT_ID,
      lane: 'vscode-aggregate',
      strategy: ContextUpdateStrategy.ReplaceSelf,
      text: summary,
      metadata: {
        source: VSCODE_HOST_PLUGIN_ID,
        generatedAt: Date.now(),
        instances: instances.size,
        model: config.model,
      },
    },
  })
}

function broadcastModelConfig() {
  if (!client)
    return

  client.send({
    type: 'module:configure',
    data: {
      config: {
        model: config.model
          ? { provider: config.model.provider, model: config.model.model }
          : undefined,
      },
    },
    route: {
      destinations: [`plugin:${VSCODE_BRIDGE_PLUGIN_ID}`],
    },
  })
}
