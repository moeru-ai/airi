import type { WebSocketEventOptionalSource } from '@proj-airi/server-sdk'

import type { VscodeActivityEventType, VscodeModelConfig } from './types'

import { useLogger } from '@guiiai/logg'
import { ContextUpdateStrategy, Client as ServerClient } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

const VSCODE_BRIDGE_PLUGIN_ID = 'proj-airi:vscode-airi'
const VSCODE_HOST_PLUGIN_ID = 'proj-airi:airi-plugin-vscode'

export interface ClientOptions {
  instanceId: string
  workspaceFolders: string[]
}

export class Client {
  private client: ServerClient | null = null
  private configuredModel: VscodeModelConfig | undefined

  constructor(private readonly options: ClientOptions) {}

  async connect(): Promise<boolean> {
    if (this.client)
      return true

    try {
      this.client = new ServerClient({
        name: VSCODE_BRIDGE_PLUGIN_ID,
        identity: {
          kind: 'plugin',
          id: `${VSCODE_BRIDGE_PLUGIN_ID}:${this.options.instanceId}`,
          plugin: {
            id: VSCODE_BRIDGE_PLUGIN_ID,
            labels: {
              source: 'vscode',
            },
          },
          labels: {
            instance: this.options.instanceId,
          },
        },
        possibleEvents: ['context:update', 'module:configure', 'module:authenticated'],
      })

      this.client.onEvent('module:configure', (event) => {
        const config = event.data?.config as { model?: VscodeModelConfig } | undefined
        this.configuredModel = config?.model
      })

      await this.client.connect()
      useLogger().log('AIRI connected to VSCode host channel')
      return true
    }
    catch (error) {
      useLogger().errorWithError('Failed to connect to AIRI channel:', error)
      this.client = null
      return false
    }
  }

  disconnect(): void {
    if (!this.client)
      return

    this.client.close()
    this.client = null
    useLogger().log('AIRI disconnected')
  }

  private async send(event: WebSocketEventOptionalSource): Promise<void> {
    if (!this.client) {
      useLogger().warn('Cannot send event: VSCode channel is not connected')
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

  private createActivityMetadata(
    eventType: VscodeActivityEventType,
    context: {
      workspaceFolder?: string
      filePath?: string
      languageId?: string
      cursor?: { line: number, character: number }
    },
  ): Record<string, unknown> {
    return {
      kind: 'vscode:activity',
      eventType,
      instanceId: this.options.instanceId,
      workspaceFolder: context.workspaceFolder,
      workspaceFolders: this.options.workspaceFolders,
      filePath: context.filePath,
      languageId: context.languageId,
      cursor: context.cursor,
      timestamp: Date.now(),
      model: this.configuredModel,
    }
  }

  async replaceContext(
    text: string,
    eventType: VscodeActivityEventType,
    context: {
      workspaceFolder?: string
      filePath?: string
      languageId?: string
      cursor?: { line: number, character: number }
    },
  ): Promise<void> {
    const id = nanoid()

    await this.send({
      type: 'context:update',
      data: {
        id,
        contextId: id,
        strategy: ContextUpdateStrategy.ReplaceSelf,
        text,
        metadata: this.createActivityMetadata(eventType, context),
      },
      route: {
        destinations: [`plugin:${VSCODE_HOST_PLUGIN_ID}`],
      },
    })
  }

  isConnected(): boolean {
    return !!this.client
  }
}
