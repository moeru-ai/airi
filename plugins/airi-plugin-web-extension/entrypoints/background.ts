import type {
  BackgroundToContentMessage,
  ContentToBackgroundMessage,
  ExtensionSettings,
  PopupToBackgroundMessage,
} from '../src/shared/types'

import {
  createClientState,
  ensureClient,
  handlePageContext,
  handleSubtitle,
  handleVideoContext,
  toStatus,
} from '../src/background/client'
import { loadSettings, saveSettings } from '../src/background/storage'
import { DEFAULT_SETTINGS, STORAGE_KEY } from '../src/shared/constants'
import { detectSiteFromUrl } from '../src/shared/sites'

const state = createClientState()

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS }
let lastVideoNotifyKey = ''
let lastStatusSentAt = 0
let connectionKey = ''

async function refreshClient() {
  const nextKey = `${settings.enabled}:${settings.wsUrl}:${settings.token}`
  if (nextKey !== connectionKey) {
    connectionKey = nextKey
    if (state.client)
      state.client.close()
    state.client = null
    state.connected = false
  }
  await ensureClient(state, settings)
}

function buildNotifyKey(payload: { url: string, title?: string, videoId?: string }) {
  return [payload.videoId, payload.title, payload.url].filter(Boolean).join('|')
}

function shouldNotifyVideo(payload: { url: string, title?: string, videoId?: string }) {
  const key = buildNotifyKey(payload)
  if (!key || key === lastVideoNotifyKey)
    return false
  lastVideoNotifyKey = key
  return true
}

function emitStatus() {
  const now = Date.now()
  if (now - lastStatusSentAt < 300)
    return

  lastStatusSentAt = now
  void browser.runtime.sendMessage({ type: 'background:status', payload: toStatus(state, settings) }).catch(() => {})
}

async function updateSettings(partial: Partial<ExtensionSettings>) {
  settings = await saveSettings(partial)
  await refreshClient()
  emitStatus()
}

async function init() {
  settings = await loadSettings()
  await refreshClient()
  emitStatus()
}

function handleContentMessage(message: ContentToBackgroundMessage) {
  switch (message.type) {
    case 'content:page': {
      const payload = {
        ...message.payload,
        site: message.payload.site === 'unknown' ? detectSiteFromUrl(message.payload.url) : message.payload.site,
      }
      handlePageContext(state, settings, payload)
      emitStatus()
      break
    }
    case 'content:video': {
      const payload = {
        ...message.payload,
        site: message.payload.site === 'unknown' ? detectSiteFromUrl(message.payload.url) : message.payload.site,
      }
      handleVideoContext(state, settings, payload, { notify: shouldNotifyVideo(payload) })
      emitStatus()
      break
    }
    case 'content:subtitle': {
      const payload = {
        ...message.payload,
        site: message.payload.site === 'unknown' ? detectSiteFromUrl(message.payload.url) : message.payload.site,
      }
      handleSubtitle(state, settings, payload)
      emitStatus()
      break
    }
    case 'content:vision:frame': {
      state.lastVisionFrameAt = Date.now()
      emitStatus()
      break
    }
  }
}

async function handlePopupMessage(message: PopupToBackgroundMessage) {
  switch (message.type) {
    case 'popup:get-status':
      return toStatus(state, settings)
    case 'popup:update-settings':
      await updateSettings(message.payload)
      return toStatus(state, settings)
    case 'popup:toggle-enabled':
      await updateSettings({ enabled: message.payload })
      return toStatus(state, settings)
    case 'popup:request-vision-frame': {
      const message: BackgroundToContentMessage = { type: 'background:request-vision-frame' }
      const tabs = await browser.tabs.query({ active: true, currentWindow: true })
      const tab = tabs[0]
      if (tab?.id != null) {
        await browser.tabs.sendMessage(tab.id, message).catch(() => {})
      }
      return toStatus(state, settings)
    }
    case 'popup:clear-error':
      state.lastError = undefined
      emitStatus()
      return toStatus(state, settings)
  }
}

export default defineBackground(() => {
  void init()

  browser.runtime.onMessage.addListener((message: ContentToBackgroundMessage | PopupToBackgroundMessage) => {
    if (message && typeof message === 'object' && 'type' in message) {
      if (message.type.startsWith('content:')) {
        handleContentMessage(message as ContentToBackgroundMessage)
        return
      }

      if (message.type.startsWith('popup:')) {
        return handlePopupMessage(message as PopupToBackgroundMessage)
      }
    }
  })

  browser.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEY]) {
      const next = changes[STORAGE_KEY].newValue as ExtensionSettings | undefined
      settings = { ...DEFAULT_SETTINGS, ...next }
      void refreshClient()
      emitStatus()
    }
  })
})
