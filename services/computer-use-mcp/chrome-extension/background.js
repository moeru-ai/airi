/**
 * background.js — MV3 Service Worker for AIRI Desktop Grounding
 *
 * Routes commands from the AIRI extension bridge → chrome.tabs.sendMessage
 * → msg_bridge.js → content.js (__AIRI_DG__)
 *
 * IMPORTANT: This background does NOT use offscreen documents or Python bridges.
 * It receives commands directly from the existing BrowserDomExtensionBridge
 * WebSocket connection in the AIRI computer-use-mcp service.
 *
 * Only read-only observation commands are supported.
 * All DOM-mutating actions (click, type, hover, scroll) have been removed
 * because the desktop lane uses real macOS OS-level input events.
 *
 * Adapted from /Users/liuziheng/computer_use/chrome-extension/background.js.
 * Stripped: offscreen management, Python bridge, all DOM-action commands
 * (clickAt, typeAt, hoverAt, scrollAt, simulateDragDrop, readStorage,
 * setStorage, readCanvasData, injectCSS, executeScript, etc.)
 */

// ---- Bridge connection ----

const DEFAULT_BRIDGE_HOST = '127.0.0.1'
const DEFAULT_BRIDGE_PORT = 8765
const BRIDGE_RECONNECT_DELAY_MS = 1000
const BRIDGE_HOST_STORAGE_KEY = 'browserDomBridgeHost'
const BRIDGE_PORT_STORAGE_KEY = 'browserDomBridgePort'

let bridgeSocket = null
let reconnectTimer = null
let connecting = false
let bridgeHost = DEFAULT_BRIDGE_HOST
let bridgePort = DEFAULT_BRIDGE_PORT

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function scheduleReconnect(delayMs = BRIDGE_RECONNECT_DELAY_MS) {
  if (reconnectTimer !== null)
    return

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectBridge().catch(() => {})
  }, delayMs)
}

function sendBridgeMessage(payload) {
  if (!bridgeSocket || bridgeSocket.readyState !== WebSocket.OPEN)
    return false

  bridgeSocket.send(JSON.stringify(payload))
  return true
}

function normalizeBridgeHost(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_BRIDGE_HOST
}

function normalizeBridgePort(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0)
    return value

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isInteger(parsed) && parsed > 0)
      return parsed
  }

  return DEFAULT_BRIDGE_PORT
}

async function loadBridgeConfig() {
  try {
    const stored = await chrome.storage.local.get([
      BRIDGE_HOST_STORAGE_KEY,
      BRIDGE_PORT_STORAGE_KEY,
    ])
    bridgeHost = normalizeBridgeHost(stored[BRIDGE_HOST_STORAGE_KEY])
    bridgePort = normalizeBridgePort(stored[BRIDGE_PORT_STORAGE_KEY])
  }
  catch {
    bridgeHost = DEFAULT_BRIDGE_HOST
    bridgePort = DEFAULT_BRIDGE_PORT
  }
}

async function saveBridgeConfig(host, port) {
  await chrome.storage.local.set({
    [BRIDGE_HOST_STORAGE_KEY]: normalizeBridgeHost(host),
    [BRIDGE_PORT_STORAGE_KEY]: normalizeBridgePort(port),
  })
  await loadBridgeConfig()
}

async function handleBridgeMessage(raw) {
  let data
  try {
    data = JSON.parse(String(raw))
  }
  catch {
    return
  }

  const response = await handleCommand(data)
  sendBridgeMessage(response)
}

async function connectBridge() {
  if (connecting)
    return
  if (bridgeSocket && (bridgeSocket.readyState === WebSocket.OPEN || bridgeSocket.readyState === WebSocket.CONNECTING))
    return

  connecting = true
  try {
    await loadBridgeConfig()
    const socket = new WebSocket(`ws://${bridgeHost}:${bridgePort}`)
    bridgeSocket = socket

    socket.addEventListener('open', () => {
      connecting = false
      clearReconnectTimer()
      sendBridgeMessage({
        type: 'hello',
        source: 'airi-desktop-grounding-extension',
        version: chrome.runtime.getManifest().version,
      })
    })

    socket.addEventListener('message', (event) => {
      void handleBridgeMessage(event.data)
    })

    socket.addEventListener('close', () => {
      if (bridgeSocket === socket) {
        bridgeSocket = null
      }
      connecting = false
      scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      connecting = false
      try {
        socket.close()
      }
      catch {}
    })
  }
  catch {
    connecting = false
    scheduleReconnect()
  }
}

function reconnectBridgeNow() {
  clearReconnectTimer()
  if (bridgeSocket) {
    try {
      bridgeSocket.close()
    }
    catch {}
    bridgeSocket = null
  }
  connecting = false
  void connectBridge()
}

// ---- Tab / Frame utilities ----

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return tabs[0] || null
}

// ---- Core: route commands to content.js via msg_bridge.js ----

/**
 * Send a CU_ACTION message to a specific tab + frame.
 * msg_bridge.js (ISOLATED world) receives → postMessage → content.js (MAIN world)
 */
async function sendCUAction(tabId, frameId, method, args) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'sendMessage timeout' })
    }, 8000)

    try {
      chrome.tabs.sendMessage(
        tabId,
        { type: 'CU_ACTION', method, args: args || [] },
        { frameId },
        (response) => {
          clearTimeout(timeout)
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message })
          }
          else {
            resolve(response || { success: false, error: 'no response' })
          }
        },
      )
    }
    catch (e) {
      clearTimeout(timeout)
      resolve({ success: false, error: e.message || String(e) })
    }
  })
}

/**
 * Run a CU_ACTION across all frames (or specified frames) in a tab.
 * Returns [{frameId, result}]
 */
async function runCUAction(tabId, frameIds, method, args) {
  let targets = frameIds
  if (!targets || (Array.isArray(targets) && targets.length === 0)) {
    const frames = await chrome.webNavigation.getAllFrames({ tabId })
    targets = frames.map(f => f.frameId)
  }
  else if (!Array.isArray(targets)) {
    targets = [targets]
  }

  return Promise.all(
    targets.map(async (fid) => {
      const result = await sendCUAction(tabId, fid, method, args)
      return { frameId: fid, result }
    }),
  )
}

// ---- Handle external commands (from AIRI extension bridge) ----

/**
 * Handle a command from the AIRI BrowserDomExtensionBridge.
 *
 * Only read-only observation commands are supported:
 * - getActiveTab: get the active tab info
 * - getAllFrames: list all frames in the active tab
 * - readAllFramesDOM: collect interactive elements from all frames
 * - findElement: find a single element by CSS selector
 * - findElements: find multiple elements by CSS selector
 * - getClickTarget: get center point of an element for click targeting
 * - getElementAttributes: get all attributes of an element
 */
async function handleCommand(cmd) {
  const { action, id } = cmd
  try {
    let result
    const tab = await getActiveTab()
    const tabId = cmd.tabId || (tab && tab.id)

    if (!tabId && action !== 'getActiveTab') {
      return { id, ok: false, error: 'no active tab' }
    }

    switch (action) {
      case 'getActiveTab':
        result = tab ? { id: tab.id, url: tab.url, title: tab.title } : null
        break

      case 'getAllFrames':
        result = await chrome.webNavigation.getAllFrames({ tabId })
        break

      case 'readAllFramesDOM':
        result = await runCUAction(tabId, cmd.frameIds || null, 'collectFrameDOM', [cmd.opts || {}])
        break

      case 'findElement':
        result = await runCUAction(tabId, cmd.frameIds || null, 'findElement', [cmd.selector || ''])
        break

      case 'findElements':
        result = await runCUAction(tabId, cmd.frameIds || null, 'findElements', [cmd.selector || '', cmd.max || 10])
        break

      case 'getClickTarget':
        result = await runCUAction(tabId, cmd.frameIds || null, 'getClickTarget', [cmd.selector || ''])
        break

      case 'getElementAttributes':
        result = await runCUAction(tabId, cmd.frameIds || null, 'getElementAttributes', [cmd.selector || ''])
        break

      default:
        return { id, ok: false, error: `unknown action: ${action}` }
    }

    return { id, ok: true, result }
  }
  catch (e) {
    return { id, ok: false, error: e.message || String(e) }
  }
}

// ---- Listen for external messages ----
// The AIRI BrowserDomExtensionBridge connects via chrome.runtime.onMessageExternal
// or through the existing WebSocket bridge mechanism

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  void connectBridge()

  if (msg.type === 'AIRI_DG_SET_BRIDGE_ENDPOINT') {
    saveBridgeConfig(msg.host, msg.port)
      .then(() => {
        reconnectBridgeNow()
        sendResponse({
          ok: true,
          host: bridgeHost,
          port: bridgePort,
        })
      })
      .catch((e) => {
        sendResponse({ ok: false, error: e?.message || String(e) })
      })
    return true
  }

  if (msg.type === 'AIRI_DG_COMMAND') {
    handleCommand(msg.data)
      .then(resp => sendResponse(resp))
      .catch(e => sendResponse({ ok: false, error: String(e) }))
    return true // Keep sendResponse async
  }

  // Support the existing ws-incoming format from BrowserDomExtensionBridge
  if (msg.type === 'ws-incoming') {
    handleCommand(msg.data)
      .then((resp) => {
        // Send response back via the same channel
        chrome.runtime.sendMessage({ type: 'ws-send', data: resp })
      })
      .catch((e) => {
        chrome.runtime.sendMessage({ type: 'ws-send', data: { id: msg.data?.id, ok: false, error: String(e) } })
      })
    return false
  }

  return false
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local')
    return

  if (changes[BRIDGE_HOST_STORAGE_KEY] || changes[BRIDGE_PORT_STORAGE_KEY]) {
    void loadBridgeConfig().finally(() => {
      reconnectBridgeNow()
    })
  }
})

chrome.runtime.onStartup.addListener(() => {
  void connectBridge()
})

chrome.runtime.onInstalled.addListener(() => {
  void connectBridge()
})

void connectBridge()
