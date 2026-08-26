import type { ContextUpdate } from '@proj-airi/server-sdk'

import type { ExtensionSettings, ExtensionStatus, PageContextPayload, SubtitlePayload, VideoContextPayload } from '../shared/types'

import { Client, ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import packageJSON from '../../package.json'

import { errorMessageFromValue } from '../utils/error-message'

const PLUGIN_NAME = 'proj-airi:plugin-web-extension'

export interface ClientState {
  client: Client | null
  connected: boolean
  lastError?: string
  lastPage?: PageContextPayload
  lastSubtitle?: SubtitlePayload
  lastVideo?: VideoContextPayload
  lastVisionFrameAt?: number
}

export function createClientState(): ClientState {
  return {
    client: null,
    connected: false,
  }
}

export function disconnectClient(state: ClientState) {
  if (!state.client)
    return

  state.client.close()
  state.client = null
  state.connected = false
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
    autoConnect: false,
    autoReconnect: true,
    identity: createIdentity(),
    name: PLUGIN_NAME,
    onClose: () => {
      state.connected = false
    },
    onError: (error) => {
      state.connected = false
      state.lastError = errorMessageFromValue(error)
    },
    possibleEvents: ['context:update', 'spark:notify', 'spark:emit'],
    token: settings.token || undefined,
    url: settings.wsUrl,
  })

  state.client = client

  try {
    await client.connect()
    state.connected = true
    state.lastError = undefined
  }
  catch (error) {
    state.connected = false
    state.lastError = errorMessageFromValue(error)
  }
}

export function handlePageContext(state: ClientState, settings: ExtensionSettings, payload: PageContextPayload) {
  state.lastPage = payload

  if (!settings.enabled || !settings.sendPageContext)
    return

  sendContextUpdate(state, {
    lane: 'web:page',
    metadata: {
      description: payload.description,
      language: payload.language,
      site: payload.site,
      source: 'web-extension',
      title: payload.title,
      url: payload.url,
    },
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: `User is browsing: ${payload.title} (${payload.url}).`,
  })
}

export function handleSubtitle(state: ClientState, settings: ExtensionSettings, payload: SubtitlePayload) {
  state.lastSubtitle = payload

  if (!settings.enabled || !settings.sendSubtitles)
    return

  sendContextUpdate(state, {
    lane: 'web:subtitle',
    metadata: {
      endMs: payload.endMs,
      isAuto: payload.isAuto,
      language: payload.language,
      site: payload.site,
      source: 'web-extension',
      startMs: payload.startMs,
      title: payload.title,
      url: payload.url,
      videoId: payload.videoId,
    },
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: `Subtitle: ${payload.text}`,
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
        channel: payload.channel,
        currentTimeSec: payload.currentTimeSec,
        durationSec: payload.durationSec,
        isLive: payload.isLive,
        isPlaying: payload.isPlaying,
        site: payload.site,
        title: payload.title,
        url: payload.url,
        videoId: payload.videoId,
      },
    })
  }

  sendContextUpdate(state, {
    lane: 'web:video',
    metadata: {
      channel: payload.channel,
      currentTimeSec: payload.currentTimeSec,
      durationSec: payload.durationSec,
      isLive: payload.isLive,
      isPlaying: payload.isPlaying,
      playbackRate: payload.playbackRate,
      playerSize: payload.playerSize,
      site: payload.site,
      source: 'web-extension',
      title: payload.title,
      url: payload.url,
      videoId: payload.videoId,
    },
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: [
      headline,
      payload.channel ? `Channel: ${payload.channel}.` : undefined,
      payload.currentTimeSec != null
        ? `Progress: ${Math.floor(payload.currentTimeSec)}s${payload.durationSec ? ` / ${Math.floor(payload.durationSec)}s` : ''}.`
        : undefined,
      payload.url ? `URL: ${payload.url}.` : undefined,
    ].filter(Boolean).join(' '),
  })
}

export function toStatus(state: ClientState, settings: ExtensionSettings): ExtensionStatus {
  return {
    connected: state.connected,
    lastError: state.lastError,
    lastPage: state.lastPage,
    lastSubtitle: state.lastSubtitle,
    lastVideo: state.lastVideo,
    lastVisionFrameAt: state.lastVisionFrameAt,
    settings,
  }
}

function createIdentity() {
  return {
    id: nanoid(),
    kind: 'plugin',
    labels: {
      runtime: 'web-extension',
    },
    plugin: {
      id: PLUGIN_NAME,
      version: typeof packageJSON.version === 'string' ? packageJSON.version : undefined,
    },
  }
}

function sendContextUpdate(state: ClientState, update: Omit<ContextUpdate, 'contextId' | 'id'> & Partial<Pick<ContextUpdate, 'contextId' | 'id'>>) {
  if (!state.client || !state.connected)
    return

  const id = update.id ?? nanoid()
  state.client.send({
    data: {
      contextId: update.contextId ?? id,
      id,
      ...update,
    },
    type: 'context:update',
  })
}

function sendSparkNotify(state: ClientState, data: { headline: string, note?: string, payload?: Record<string, unknown> }) {
  if (!state.client || !state.connected)
    return

  state.client.send({
    data: {
      destinations: ['character'],
      eventId: nanoid(),
      headline: data.headline,
      id: nanoid(),
      kind: 'ping',
      note: data.note,
      payload: data.payload,
      urgency: 'soon',
    },
    type: 'spark:notify',
  })
}
