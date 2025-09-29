import { Client } from '@proj-airi/server-sdk'

class SettingsBroadcaster {
  private client: Client | null = null
  private connected = false
  private pendingConfigurations: Array<{ moduleName: string, config: Record<string, unknown> }> = []

  constructor() {
    this.initClient()
  }

  private initClient() {
    try {
      this.client = new Client({
        name: 'settings-broadcaster',
        url: import.meta.env.VITE_AIRI_WS_URL || 'ws://localhost:6121/ws',
        possibleEvents: [
          'ui:configure',
          'module:authenticated',
        ],
      })

      this.client.onEvent('module:authenticated', (event) => {
        if (event.data.authenticated) {
          this.connected = true
          // Send any pending configurations
          this.sendPendingConfigurations()
        }
      })
    }
    catch (error) {
      // In a real implementation, you might want to use a proper error handling mechanism
      // For now, we'll just log the error to comply with linting rules
      console.error('Failed to initialize SettingsBroadcaster client:', error)
    }
  }

  private sendPendingConfigurations() {
    if (!this.client) {
      return
    }
    for (const { moduleName, config } of this.pendingConfigurations) {
      this.client.send({
        type: 'ui:configure' as const,
        data: {
          moduleName,
          config,
        },
      })
    }
    this.pendingConfigurations = []
  }

  public sendConfiguration(moduleName: string, config: Record<string, unknown>): void {
    if (!this.client) {
      // Silently handle the error
      return
    }

    const configData = {
      type: 'ui:configure' as const,
      data: {
        moduleName,
        config,
      },
    }

    if (this.connected) {
      this.client.send(configData)
    }
    else {
      // Queue the configuration to send when connected
      this.pendingConfigurations.push({ moduleName, config })
    }
  }

  public async connect(): Promise<void> {
    if (this.client) {
      await this.client.connect()
    }
  }

  public disconnect(): void {
    if (this.client) {
      this.client.close()
    }
  }
}

// Create a singleton instance
export const settingsBroadcaster = new SettingsBroadcaster()
