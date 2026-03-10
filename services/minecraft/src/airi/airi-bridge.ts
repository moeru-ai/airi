import type { Client } from '@proj-airi/server-sdk'

import type { EventBus } from '../cognitive/event-bus'

import { useLogg } from '@guiiai/logg'
import { nanoid } from 'nanoid'

interface SparkCommandData {
  commandId: string
  intent: 'plan' | 'proposal' | 'action' | 'pause' | 'resume' | 'reroute' | 'context'
  interrupt: 'force' | 'soft' | false
  priority: 'critical' | 'high' | 'normal' | 'low'
  guidance?: {
    options?: Array<{ label: string, steps: string[] }>
  }
}

export class AiriBridge {
  private readonly logger = useLogg('airi-bridge').useGlobalConfig()
  private commandHandler: ((event: { data: SparkCommandData }) => void) | null = null

  constructor(
    private readonly client: Client,
    private readonly eventBus: EventBus,
  ) {}

  init(): void {
    this.commandHandler = (event) => {
      const cmd = event.data
      this.logger.log('Received spark:command', { intent: cmd.intent, commandId: cmd.commandId })

      this.client.send({
        type: 'spark:emit',
        data: {
          id: nanoid(),
          eventId: cmd.commandId,
          state: 'queued',
          note: 'Command received',
        },
      } as Parameters<typeof this.client.send>[0])

      const steps = cmd.guidance?.options?.[0]?.steps ?? []
      const instructionText = steps.length > 0
        ? steps.join('\n')
        : `${cmd.intent} command received`

      this.eventBus.emit({
        type: 'signal:chat_message',
        payload: Object.freeze({
          type: 'chat_message',
          description: `Instruction from AIRI: "${instructionText}"`,
          sourceId: 'airi',
          confidence: 1.0,
          timestamp: Date.now(),
          metadata: {
            source: 'airi',
            commandId: cmd.commandId,
            intent: cmd.intent,
            interrupt: cmd.interrupt,
          },
        }),
        source: { component: 'airi', id: 'bridge' },
      })
    }

    this.client.onEvent('spark:command', this.commandHandler as Parameters<typeof this.client.onEvent<'spark:command'>>[1])
    this.logger.log('AiriBridge initialized, listening for spark:command')
  }

  destroy(): void {
    if (this.commandHandler) {
      this.client.offEvent('spark:command', this.commandHandler as Parameters<typeof this.client.offEvent<'spark:command'>>[1])
      this.commandHandler = null
    }
    this.logger.log('AiriBridge destroyed')
  }

  sendNotify(headline: string, note?: string, urgency: 'immediate' | 'soon' | 'later' = 'soon'): void {
    this.client.send({
      type: 'spark:notify',
      data: {
        id: nanoid(),
        eventId: nanoid(),
        kind: 'ping',
        urgency,
        headline,
        note,
      },
    } as Parameters<typeof this.client.send>[0])
    this.logger.log('Sent spark:notify', { headline, urgency })
  }

  sendContextUpdate(text: string, hints?: string[], lane = 'game'): void {
    this.client.send({
      type: 'context:update',
      data: {
        id: nanoid(),
        contextId: nanoid(),
        lane,
        text,
        hints,
        strategy: 'append-self',
      },
    } as Parameters<typeof this.client.send>[0])
    this.logger.log('Sent context:update', { lane, preview: text.slice(0, 80) })
  }
}
