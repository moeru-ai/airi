import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk'

import { useLogg } from '@guiiai/logg'
import { Client as AiriClient } from '@proj-airi/server-sdk'
import { ClientEvent, createClient, RoomEvent, SyncState } from 'matrix-js-sdk'

const log = useLogg('MatrixAdapter')

export interface MatrixAdapterConfig {
  homeserverUrl: string
  accessToken: string
  userId: string
  airiToken?: string
  airiUrl?: string
}

export class MatrixAdapter {
  private airiClient: AiriClient
  private matrixClient: MatrixClient
  private config: MatrixAdapterConfig
  private processedIds = new Set<string>()

  constructor(config: MatrixAdapterConfig) {
    this.config = config

    this.airiClient = new AiriClient({
      name: 'matrix',
      possibleEvents: ['input:text', 'output:gen-ai:chat:message', 'module:configure'],
      token: config.airiToken,
      url: config.airiUrl || 'ws://localhost:6121/ws',
      autoConnect: true,
      autoReconnect: true,
      onClose: () => {
        log.warn('AIRI server connection closed.')
      },
      onError: (error) => {
        log.withError(error as Error).error('AIRI connection error')
      },
    })

    this.matrixClient = createClient({
      baseUrl: config.homeserverUrl,
      accessToken: config.accessToken,
      userId: config.userId,
    })

    this.setupMatrixHandlers()
  }

  private setupMatrixHandlers(): void {
    this.matrixClient.on(RoomEvent.Timeline, (event: MatrixEvent, _room: Room | undefined, toStartOfTimeline: boolean | undefined) => {
      if (toStartOfTimeline)
        return
      if (event.getSender() === this.matrixClient.getUserId())
        return

      const eventType = event.getType()

      if (eventType === 'm.room.member') {
        const content = event.getContent()
        if (content.membership === 'invite' && event.getStateKey() === this.matrixClient.getUserId()) {
          log.log(`Received invite to room ${event.getRoomId()}, joining...`)
          this.matrixClient.joinRoom(event.getRoomId()!).catch((err) => {
            log.withError(err).error(`Failed to join room ${event.getRoomId()}`)
          })
        }
        return
      }

      if (eventType !== 'm.room.message')
        return

      const roomId = event.getRoomId()
      const sender = event.getSender()

      if (!roomId || !sender)
        return

      log.debug(`Processing message from ${sender} in room ${roomId}: ${event.getContent().body}`)

      const eventId = event.getId()
      if (!eventId || this.processedIds.has(eventId))
        return
      this.processedIds.add(eventId)

      const body = event.getContent().body
      if (!body)
        return

      log.log(`Received Matrix message in room ${roomId} from ${sender}`)
      log.log(`Forwarding message to AIRI server: "${body}"`)

      this.airiClient.send({
        type: 'input:text',
        data: {
          text: body,
          textRaw: body,
          matrix: {
            roomId,
          },
          overrides: {
            sessionId: roomId,

            sender,
          },
        },
      })
    })

    this.airiClient.onEvent('output:gen-ai:chat:message', (event) => {
      log.debug('Received output:gen-ai:chat:message from AIRI server', event.data)
      const data = event.data as any
      const message = data.message
      const matrixContext = data.matrix || data['gen-ai:chat']?.input?.data?.matrix
      const roomId = matrixContext?.roomId || data.overrides?.sessionId

      if (roomId && message?.content) {
        log.log(`Received response from AIRI for room ${roomId}, sending to Matrix...`)
        this.matrixClient.sendEvent(roomId, 'm.room.message' as any, {
          msgtype: 'm.text',
          body: message.content,
        }).catch((err) => {
          log.withError(err).error(`Failed to send message to Matrix room ${roomId}`)
        })
      }
    })

    this.airiClient.onEvent('error', (event) => {
      log.withFields({ data: event.data }).error('Received error event from AIRI server')
    })

    this.airiClient.onEvent('module:configure', (event) => {
      log.log('Received module configuration from AIRI UI:', event.data.config)
    })

    this.airiClient.onEvent('module:authenticated', (event) => {
      if (event.data.authenticated) {
        log.log('Successfully authenticated with AIRI server')
      }
    })

    this.matrixClient.on(ClientEvent.Sync, (state: SyncState, prevState: SyncState | null) => {
      if (state === SyncState.Prepared && prevState === SyncState.Syncing) {
        const rooms = this.matrixClient.getRooms()
        const invitedRooms = rooms.filter(r => r.getMyMembership() === 'invite')

        if (invitedRooms.length > 0) {
          log.log(`Found ${invitedRooms.length} pending invites on startup, joining now...`)
          for (const room of invitedRooms) {
            this.matrixClient.joinRoom(room.roomId).catch((err) => {
              log.withError(err).error(`Failed to catch-up join room ${room.roomId}`)
            })
          }
        }
      }

      log.log(`Matrix sync state changed: ${prevState} -> ${state}`)
      if (state === SyncState.Error) {
        log.error('Matrix sync error occurred')
      }
    })
  }

  async start(): Promise<void> {
    log.log('Starting Matrix adapter...')
    try {
      log.log('AIRI adapter initialization started (connecting in background)...')

      if (this.config.homeserverUrl && this.config.accessToken && this.config.userId) {
        log.log('Starting Matrix client...')
        await this.matrixClient.startClient({ initialSyncLimit: 10 })
        log.log('Matrix client started. Actual UserID:', this.matrixClient.getUserId())
      }
      else {
        log.log('Matrix credentials missing or incomplete. Bot will remain idle until configured via AIRI UI.')
      }
    }
    catch (error) {
      log.withError(error as Error).error('Failed to initialize Matrix components')
    }
  }

  async stop(): Promise<void> {
    log.log('Stopping Matrix adapter...')
    this.matrixClient.stopClient()
    this.airiClient.close()
  }
}
