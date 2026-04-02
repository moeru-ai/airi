import type { ContextUpdate } from '@proj-airi/server-sdk'
import type { WebSocketEvents } from '@proj-airi/server-shared/types'

import type {
  OpenClawGatewayClientOptions,
  OpenClawSparkCommandMetadata,
  OpenClawTaskUpdate,
} from './types'

import { useLogg } from '@guiiai/logg'
import { Client, ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import { OpenClawTaskHistoryStore } from './history-store'
import { OpenClawBridge } from './openclaw-bridge'
import { OpenClawGatewayClient } from './openclaw-gateway-client'
import { OPENCLAW_RESULT_CONTEXT_LANE, OPENCLAW_TASK_CONTEXT_LANE } from './types'

type SparkCommandEvent = WebSocketEvents['spark:command']

type OpenClawBridgeOutgoingEvent
  = | {
    data: WebSocketEvents['spark:emit']
    metadata?: {
      event?: {
        parentId?: string
      }
    }
    type: 'spark:emit'
  }
  | {
    data: ContextUpdate
    metadata?: {
      event?: {
        parentId?: string
      }
    }
    type: 'context:update'
  }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
    ? [...value]
    : undefined
}

function readOpenClawMetadata(command: SparkCommandEvent): OpenClawSparkCommandMetadata | undefined {
  const metadataContainer = command.contexts
    ?.find(context => context.lane?.startsWith('openclaw:') || isRecord(context.metadata?.openclaw))
    ?.metadata

  if (!isRecord(metadataContainer?.openclaw)) {
    return undefined
  }

  return metadataContainer.openclaw as OpenClawSparkCommandMetadata
}

function buildTaskText(command: SparkCommandEvent, metadata: OpenClawSparkCommandMetadata | undefined): string {
  const explicitTaskText = readString(metadata?.taskText)
  if (explicitTaskText) {
    return explicitTaskText
  }

  const laneContextText = command.contexts
    ?.find(context => context.lane === OPENCLAW_TASK_CONTEXT_LANE)
    ?.text

  if (laneContextText && laneContextText.length > 0) {
    return laneContextText
  }

  const guidanceSteps = command.guidance?.options.flatMap(option => option.steps).filter(step => step.length > 0) ?? []
  if (guidanceSteps.length > 0) {
    return guidanceSteps.join('\n')
  }

  return `${command.intent} command ${command.commandId}`
}

function buildDelegatedContext(command: SparkCommandEvent) {
  return (command.contexts ?? []).map(context => ({
    label: context.lane ?? 'general',
    value: context.text,
    metadata: context.metadata,
  }))
}

function isOpenClawCommand(command: SparkCommandEvent, moduleName: string): boolean {
  return command.destinations.includes(moduleName)
}

function isDelegationIntent(intent: SparkCommandEvent['intent']): boolean {
  return intent === 'action' || intent === 'plan' || intent === 'proposal'
}

function isFinalStatus(status: OpenClawTaskUpdate['status']) {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export interface OpenClawBridgeIncomingEvent<T> {
  data: T
  metadata: {
    event: {
      id: string
    }
  }
}

export interface OpenClawBridgeClient {
  close: () => void
  connect: () => Promise<void>
  onEvent: (
    event: 'spark:command',
    callback: (data: OpenClawBridgeIncomingEvent<SparkCommandEvent>) => void | Promise<void>,
  ) => () => void
  send: (data: OpenClawBridgeOutgoingEvent) => boolean
}

export interface OpenClawBridgeAdapterConfig extends OpenClawGatewayClientOptions {
  airiToken?: string
  airiUrl?: string
  bridge?: OpenClawBridge
  client?: OpenClawBridgeClient
  clientName?: string
  defaultDestinations?: string[]
  historyStore?: OpenClawTaskHistoryStore
}

function toSparkState(status: OpenClawTaskUpdate['status']): 'queued' | 'working' | 'done' | 'dropped' {
  switch (status) {
    case 'queued':
      return 'queued'
    case 'running':
      return 'working'
    case 'completed':
      return 'done'
    case 'failed':
    case 'cancelled':
      return 'dropped'
  }
}

function buildSparkNote(update: OpenClawTaskUpdate): string {
  switch (update.status) {
    case 'queued':
      return update.note ?? 'OpenClaw task queued.'
    case 'running':
      return update.note ?? 'OpenClaw task running.'
    case 'completed':
      return update.result?.summary ?? update.note ?? 'OpenClaw task completed.'
    case 'failed':
      return update.error?.message ?? update.note ?? 'OpenClaw task failed.'
    case 'cancelled':
      return update.note ?? 'OpenClaw task cancelled.'
  }
}

export class OpenClawBridgeAdapter {
  private readonly logger = useLogg('openclaw-bridge').useGlobalConfig()
  private readonly bridge: OpenClawBridge
  private readonly client: OpenClawBridgeClient
  private readonly defaultDestinations: string[]
  private readonly moduleName: string
  private readonly disposers: Array<() => void> = []
  private started = false

  constructor(config: OpenClawBridgeAdapterConfig) {
    const historyStore = config.historyStore ?? new OpenClawTaskHistoryStore()
    this.bridge = config.bridge ?? new OpenClawBridge({
      gatewayClient: new OpenClawGatewayClient(config),
      historyStore,
    })
    this.moduleName = config.clientName ?? 'openclaw-bridge'
    this.client = config.client ?? new Client({
      autoConnect: false,
      name: this.moduleName,
      possibleEvents: ['spark:command'],
      token: config.airiToken,
      url: config.airiUrl,
    })
    this.defaultDestinations = config.defaultDestinations ?? ['proj-airi:stage-*']
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.started = true

    this.disposers.push(this.bridge.onTaskUpdate((update) => {
      this.publishTaskUpdate(update)
    }))

    this.disposers.push(this.client.onEvent('spark:command', async (event) => {
      await this.handleSparkCommand(event)
    }))

    await this.client.connect()
    this.logger.log('OpenClaw bridge adapter started')
  }

  stop(): void {
    if (!this.started) {
      return
    }

    this.started = false

    for (const dispose of this.disposers.splice(0)) {
      dispose()
    }

    this.bridge.dispose()
    this.client.close()
    this.logger.log('OpenClaw bridge adapter stopped')
  }

  private async handleSparkCommand(event: OpenClawBridgeIncomingEvent<SparkCommandEvent>): Promise<void> {
    const command = event.data
    if (!isOpenClawCommand(command, this.moduleName)) {
      return
    }

    const openClawMetadata = readOpenClawMetadata(command)
    if (!openClawMetadata) {
      return
    }

    if (command.intent === 'pause') {
      const taskId = readString(openClawMetadata.taskId)
      if (!taskId) {
        return
      }

      const cancelled = this.bridge.cancelTask(taskId, command.ack ?? 'OpenClaw task cancelled by spark command.')
      this.logger.log('Processed OpenClaw task cancellation', { cancelled, taskId })
      return
    }

    if (!isDelegationIntent(command.intent)) {
      return
    }

    const taskId = this.bridge.delegateTask({
      taskText: buildTaskText(command, openClawMetadata),
      source: readString(openClawMetadata.source) ?? 'spark:command',
      userId: readString(openClawMetadata.userId) ?? 'unknown',
      conversationId: readString(openClawMetadata.conversationId) ?? command.commandId,
      context: buildDelegatedContext(command),
      returnMode: openClawMetadata.returnMode ?? 'structured',
      destinations: readStringArray(openClawMetadata.replyDestinations) ?? this.defaultDestinations,
      metadata: {
        openclaw: openClawMetadata,
        sparkCommandId: command.commandId,
        sparkEventId: command.eventId,
        sparkIntent: command.intent,
      },
    }, { sourceEventId: event.metadata.event.id })

    this.logger.log('Accepted delegated OpenClaw task', { taskId, source: readString(openClawMetadata.source) ?? 'spark:command' })
  }

  private publishTaskUpdate(update: OpenClawTaskUpdate): void {
    const metadata: OpenClawBridgeOutgoingEvent['metadata'] = update.sourceEventId
      ? { event: { parentId: update.sourceEventId } }
      : undefined

    const sparkCommandId = readString(update.request.metadata?.sparkCommandId)

    this.client.send({
      type: 'spark:emit',
      data: {
        id: nanoid(),
        eventId: sparkCommandId ?? update.taskId,
        state: toSparkState(update.status),
        note: buildSparkNote(update),
        destinations: update.request.destinations ?? this.defaultDestinations,
        metadata: {
          openclaw: {
            error: update.error,
            result: update.result,
            status: update.status,
            taskId: update.taskId,
            timestamp: update.timestamp,
          },
        },
      },
      metadata,
    })

    if (!isFinalStatus(update.status)) {
      return
    }

    this.client.send({
      type: 'context:update',
      data: {
        id: nanoid(),
        contextId: `openclaw:${update.taskId}`,
        lane: OPENCLAW_RESULT_CONTEXT_LANE,
        text: buildSparkNote(update),
        hints: ['openclaw', 'task', update.status],
        strategy: ContextUpdateStrategy.ReplaceSelf,
        destinations: update.request.destinations ?? this.defaultDestinations,
        metadata: {
          openclaw: {
            commandId: sparkCommandId,
            error: update.error,
            request: update.request,
            result: update.result,
            status: update.status,
            taskId: update.taskId,
            timestamp: update.timestamp,
          },
        },
      },
      metadata,
    })
  }
}
