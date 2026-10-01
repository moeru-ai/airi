import type { ContextSourceRef } from '@proj-airi/core-agent/context'
import type { WebSocketEventOptionalSource } from '@proj-airi/server-sdk'

import type { Events } from './types'

import { useLogger } from '@guiiai/logg'
import { createContextText } from '@proj-airi/core-agent/context'
import { ContextUpdateStrategy, Client as ServerClient } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

const EVENT_CONTEXT_HISTORY_LIMIT = 8

export class Client {
  private client: ServerClient<Events> | null = null
  private workspaceContext?: string
  private readonly eventContexts = new Map<string, string>()

  async connect(): Promise<boolean> {
    try {
      this.client = new ServerClient<Events>({ name: 'proj-airi:plugin-vscode' })
      await this.client.connect()
      useLogger().log('AIRI connected to Server Channel')
      return true
    }
    catch (error) {
      useLogger().errorWithError('Failed to connect to AIRI Server Channel:', error)
      return false
    }
  }

  disconnect(): void {
    this.workspaceContext = undefined
    this.eventContexts.clear()
    if (this.client) {
      this.client.close()
      this.client = null
      useLogger().log('AIRI disconnected')
    }
  }

  private async send(event: WebSocketEventOptionalSource<Events>): Promise<void> {
    if (!this.client) {
      useLogger().warn('Cannot send event: not connected to AIRI Server Channel')
      return
    }

    try {
      await this.client.connect()
      this.client.send(event)
    }
    catch (error) {
      useLogger().errorWithError('Failed to send event to AIRI:', error)
    }
  }

  /** Replaces the workspace observation without accumulating obsolete document slots. */
  async replaceContext(context: string): Promise<void> {
    const id = nanoid()
    this.workspaceContext = context
    await this.send({ type: 'context:update', data: {
      strategy: ContextUpdateStrategy.ReplaceSelf,
      ...createContextText(context, { refType: 'vscode:context', targetId: 'workspace' }),
      id,
      contextId: 'workspace',
    } })
  }

  /** Publishes an event to the bounded append slot, separate from the workspace observation. */
  async appendContext(context: string): Promise<void> {
    const id = nanoid()
    this.eventContexts.set(id, context)
    if (this.eventContexts.size > EVENT_CONTEXT_HISTORY_LIMIT) {
      const oldest = this.eventContexts.keys().next().value
      if (oldest !== undefined)
        this.eventContexts.delete(oldest)
    }
    await this.send({ type: 'context:update', data: {
      strategy: ContextUpdateStrategy.AppendSelf,
      ...createContextText(context, { refType: 'vscode:context', targetId: id }),
      id,
      contextId: 'events',
    } })
  }

  /** Reads current workspace or retained event details. Disconnect discards these module-owned records. */
  getContext(sourceRef: ContextSourceRef): string | undefined {
    if (sourceRef.refType !== 'vscode:context')
      return undefined
    return sourceRef.targetId === 'workspace' ? this.workspaceContext : this.eventContexts.get(sourceRef.targetId)
  }

  isConnected(): boolean {
    return !!this.client
  }
}
