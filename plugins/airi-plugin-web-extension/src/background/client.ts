import type { ContextUpdate } from '@proj-airi/server-sdk'

import type { ExtensionSettings, ExtensionStatus, PageContextPayload, SubtitlePayload, VideoContextPayload } from '../shared/types'

import { Client, ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import packageJSON from '../../package.json'

const PLUGIN_NAME = 'proj-airi:plugin-web-extension'

export interface ClientState {
  client: Client | null
  connected: boolean
  lastError?: string
  lastPage?: PageContextPayload
  lastVideo?: VideoContextPayload
  lastSubtitle?: SubtitlePayload
  lastVisionFrameAt?: number
}

export function createClientState(): ClientState {
  return {
    client: null,
    connected: false,
  }
}

function createIdentity() {
  return {
    plugin: PLUGIN_NAME,
    instanceId: nanoid(),
    version: typeof packageJSON.version === 'string' ? packageJSON.version : undefined,
    labels: {
      runtime: 'web-extension',
    },
  }
}

export function toStatus(state: ClientState, settings: ExtensionSettings): ExtensionStatus {
  return {
    connected: state.connected,
    lastError: state.lastError,
    settings,
    lastPage: state.lastPage,
    lastVideo: state.lastVideo,
    lastSubtitle: state.lastSubtitle,
    lastVisionFrameAt: state.lastVisionFrameAt,
  }
}

export async function ensureClient(state: ClientState, settings: ExtensionSettings) {
  if (!settings.enabled) {
    disconnectClient(state)
    return
  }

  if (state.client) {
    return
  }

  const client = new Client({
    name: PLUGIN_NAME,
    url: settings.wsUrl,
    token: settings.token || undefined,
    identity: createIdentity(),
    possibleEvents: ['context:update', 'spark:notify', 'spark:emit'],
    autoConnect: false,
    autoReconnect: true,
    onError: (error) => {
      state.connected = false
      state.lastError = error instanceof Error ? error.message : String(error)
    },
    onClose: () => {
      state.connected = false
    },
  })

  state.client = client

  try {
    await client.connect()
    state.connected = true
    state.lastError = undefined
  }
  catch (error) {
    state.connected = false
    state.lastError = error instanceof Error ? error.message : String(error)
  }
}

export function disconnectClient(state: ClientState) {
  if (!state.client)
    return

  state.client.close()
  state.client = null
  state.connected = false
}

function sendContextUpdate(state: ClientState, update: Omit<ContextUpdate, 'id' | 'contextId'> & Partial<Pick<ContextUpdate, 'id' | 'contextId'>>) {
  if (!state.client || !state.connected)
    return

  const id = update.id ?? nanoid()
  state.client.send({
    type: 'context:update',
    data: {
      id,
      contextId: update.contextId ?? id,
      ...update,
    },
  })
}

function sendSparkNotify(state: ClientState, data: { headline: string, note?: string, payload?: Record<string, unknown> }) {
  if (!state.client || !state.connected)
    return

  state.client.send({
    type: 'spark:notify',
    data: {
      id: nanoid(),
      eventId: nanoid(),
      kind: 'ping',
      urgency: 'soon',
      headline: data.headline,
      note: data.note,
      payload: data.payload,
      destinations: ['character'],
    },
  })
}

export function handlePageContext(state: ClientState, settings: ExtensionSettings, payload: PageContextPayload) {
  state.lastPage = payload

  if (!settings.enabled || !settings.sendPageContext)
    return

  sendContextUpdate(state, {
    strategy: ContextUpdateStrategy.ReplaceSelf,
    lane: 'web:page',
    text: `User is browsing: ${payload.title} (${payload.url}).`,
    metadata: {
      source: 'web-extension',
      site: payload.site,
      url: payload.url,
      title: payload.title,
      description: payload.description,
      language: payload.language,
    },
  })
}

export function handleVideoContext(
  state: ClientState,
  settings: ExtensionSettings,
  payload: VideoContextPayload,
  options?: { notify?: boolean },
) {
  state.lastVideo = payload

  if (!settings.enabled || !settings.sendVideoContext)
    return

  const headline = payload.title
    ? `User is watching: ${payload.title}`
    : 'User is watching a video'

  if (settings.sendSparkNotify && options?.notify !== false && payload.title) {
    sendSparkNotify(state, {
      headline,
      note: payload.channel ? `Channel: ${payload.channel}` : undefined,
      payload: {
        site: payload.site,
        url: payload.url,
        title: payload.title,
        channel: payload.channel,
        videoId: payload.videoId,
        durationSec: payload.durationSec,
        currentTimeSec: payload.currentTimeSec,
        isPlaying: payload.isPlaying,
        isLive: payload.isLive,
      },
    })
  }

  sendContextUpdate(state, {
    strategy: ContextUpdateStrategy.ReplaceSelf,
    lane: 'web:video',
    text: [
      headline,
      payload.channel ? `Channel: ${payload.channel}.` : undefined,
      payload.currentTimeSec != null
        ? `Progress: ${Math.floor(payload.currentTimeSec)}s${payload.durationSec ? ` / ${Math.floor(payload.durationSec)}s` : ''}.`
        : undefined,
      payload.url ? `URL: ${payload.url}.` : undefined,
    ].filter(Boolean).join(' '),
    metadata: {
      source: 'web-extension',
      site: payload.site,
      url: payload.url,
      title: payload.title,
      channel: payload.channel,
      videoId: payload.videoId,
      durationSec: payload.durationSec,
      currentTimeSec: payload.currentTimeSec,
      isPlaying: payload.isPlaying,
      playbackRate: payload.playbackRate,
      isLive: payload.isLive,
      playerSize: payload.playerSize,
    },
  })
}

export function handleSubtitle(state: ClientState, settings: ExtensionSettings, payload: SubtitlePayload) {
  state.lastSubtitle = payload

  if (!settings.enabled || !settings.sendSubtitles)
    return

  sendContextUpdate(state, {
    strategy: ContextUpdateStrategy.ReplaceSelf,
    lane: 'web:subtitle',
    text: `Subtitle: ${payload.text}`,
    metadata: {
      source: 'web-extension',
      site: payload.site,
      url: payload.url,
      title: payload.title,
      videoId: payload.videoId,
      language: payload.language,
      startMs: payload.startMs,
      endMs: payload.endMs,
      isAuto: payload.isAuto,
    },
  })
}
