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

/* global chrome */

const AIRI_BRIDGE_URL = 'ws://127.0.0.1:8765'
const AIRI_BRIDGE_HELLO = {
  source: 'airi-chrome-extension',
  type: 'hello',
  version: '1.1.0',
}
const BRIDGE_RECONNECT_MIN_MS = 1_000
const BRIDGE_RECONNECT_MAX_MS = 10_000
const SEND_CU_ACTION_TIMEOUT_MS = 8_000
const WAIT_FOR_ELEMENT_POLL_INTERVAL_MS = 500

let bridgeSocket = null
let bridgeReconnectDelayMs = BRIDGE_RECONNECT_MIN_MS
let bridgeReconnectTimer = null

function buildFrameOffsets(frameInfos, domResults, parentAnchorsByFrameId) {
  const frameInfoById = new Map(frameInfos.map(frame => [frame.frameId, frame]))
  const domPayloadByFrameId = new Map(domResults.map(entry => [entry.frameId, unwrapBridgePayload(entry.result)]))
  const directChildCountByParentId = new Map()

  for (const frame of frameInfos) {
    if (typeof frame.parentFrameId !== 'number' || frame.parentFrameId < 0)
      continue
    directChildCountByParentId.set(frame.parentFrameId, (directChildCountByParentId.get(frame.parentFrameId) || 0) + 1)
  }

  const cache = new Map()

  function resolve(frameId) {
    if (cache.has(frameId))
      return cache.get(frameId)

    if (frameId === 0) {
      const rootOffset = { x: 0, y: 0 }
      cache.set(frameId, rootOffset)
      return rootOffset
    }

    const frameInfo = frameInfoById.get(frameId)
    if (!frameInfo || typeof frameInfo.parentFrameId !== 'number' || frameInfo.parentFrameId < 0) {
      cache.set(frameId, null)
      return null
    }

    const parentOffset = resolve(frameInfo.parentFrameId)
    if (!parentOffset) {
      cache.set(frameId, null)
      return null
    }

    const payload = domPayloadByFrameId.get(frameId)
    const directOffset = payload?.frameOffsetInParent
    if (directOffset && typeof directOffset.x === 'number' && typeof directOffset.y === 'number') {
      const resolved = {
        x: parentOffset.x + directOffset.x,
        y: parentOffset.y + directOffset.y,
      }
      cache.set(frameId, resolved)
      return resolved
    }

    const parentAnchors = parentAnchorsByFrameId.get(frameInfo.parentFrameId) || []
    const bestAnchor = pickBestChildAnchor(parentAnchors, payload || frameInfo, directChildCountByParentId.get(frameInfo.parentFrameId) || 0)

    if (!bestAnchor?.rect) {
      cache.set(frameId, null)
      return null
    }

    const resolved = {
      x: parentOffset.x + bestAnchor.rect.x,
      y: parentOffset.y + bestAnchor.rect.y,
    }
    cache.set(frameId, resolved)
    return resolved
  }

  for (const entry of domResults) {
    resolve(entry.frameId)
  }

  return cache
}

function clearBridgeReconnectTimer() {
  if (!bridgeReconnectTimer)
    return

  clearTimeout(bridgeReconnectTimer)
  bridgeReconnectTimer = null
}

async function ensureBridgeConnected() {
  if (bridgeSocket && (bridgeSocket.readyState === WebSocket.OPEN || bridgeSocket.readyState === WebSocket.CONNECTING)) {
    return
  }

  clearBridgeReconnectTimer()

  try {
    const socket = new WebSocket(AIRI_BRIDGE_URL)
    bridgeSocket = socket

    socket.addEventListener('open', () => {
      bridgeReconnectDelayMs = BRIDGE_RECONNECT_MIN_MS
      sendBridgePayload(AIRI_BRIDGE_HELLO)
    })

    socket.addEventListener('message', (event) => {
      handleBridgeSocketMessage(event.data).catch(() => {})
    })

    socket.addEventListener('close', () => {
      if (bridgeSocket === socket) {
        bridgeSocket = null
      }
      scheduleBridgeReconnect()
    })

    socket.addEventListener('error', () => {
      try {
        socket.close()
      }
      catch {
        // Ignore close failures and rely on reconnect scheduling.
      }
    })
  }
  catch {
    scheduleBridgeReconnect()
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return tabs[0] || null
}

async function handleBridgeSocketMessage(raw) {
  let data
  try {
    data = JSON.parse(String(raw))
  }
  catch {
    return
  }

  if (!data || typeof data !== 'object' || typeof data.id !== 'string')
    return

  const response = await handleCommand(data)
  sendBridgePayload(response)
}

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
 * - readInputValue: read the current value of an input/textarea/select
 * - getComputedStyles: read computed CSS styles of an element
 * - waitForElement: poll until a CSS selector matches in any frame
 */
async function handleCommand(cmd) {
  const { action, id } = cmd
  try {
    let result
    const tab = await getActiveTab()
    const tabId = cmd.tabId || (tab && tab.id)

    if (!tabId && action !== 'getActiveTab') {
      return { error: 'no active tab', id, ok: false }
    }

    switch (action) {
      case 'findElement':
        result = await runCUAction(tabId, cmd.frameIds || null, 'findElement', [cmd.selector || ''])
        break

      case 'findElements':
        result = await runCUAction(tabId, cmd.frameIds || null, 'findElements', [cmd.selector || '', cmd.max || 10])
        break

      case 'getActiveTab':
        result = tab ? { id: tab.id, title: tab.title, url: tab.url } : null
        break

      case 'getAllFrames':
        result = await chrome.webNavigation.getAllFrames({ tabId })
        break

      case 'getClickTarget':
        result = await runCUAction(tabId, cmd.frameIds || null, 'getClickTarget', [cmd.selector || ''])
        break

      case 'getComputedStyles':
        result = await runCUAction(tabId, cmd.frameIds || null, 'getComputedStyles', [cmd.selector || '', cmd.properties || null])
        break

      case 'getElementAttributes':
        result = await runCUAction(tabId, cmd.frameIds || null, 'getElementAttributes', [cmd.selector || ''])
        break

      case 'readAllFramesDOM':
        result = await readAllFramesDOMWithOffsets(tabId, cmd.frameIds || null, cmd.opts || {})
        break

      case 'readInputValue':
        result = await runCUAction(tabId, cmd.frameIds || null, 'readInputValue', [cmd.selector || ''])
        break

      case 'waitForElement': {
        // Background-level polling: repeatedly call findElements until a match
        // is found or the timeout expires. No DOM MutationObserver needed.
        const selector = cmd.selector || ''
        const timeoutMs = Math.min(Math.max(Number(cmd.timeoutMs) || 10_000, 500), 30_000)
        const deadline = Date.now() + timeoutMs
        let lastFrames = []
        let lastPollError = ''
        let lastFrameError = ''

        result = await new Promise((resolve) => {
          async function resolveTimeout() {
            if (lastFrames.length === 0) {
              let frameIds = []
              if (Array.isArray(cmd.frameIds) && cmd.frameIds.length > 0) {
                frameIds = cmd.frameIds
              }
              else if (typeof cmd.frameIds === 'number') {
                frameIds = [cmd.frameIds]
              }
              else {
                try {
                  const frames = await chrome.webNavigation.getAllFrames({ tabId })
                  frameIds = frames.map(frame => frame.frameId)
                }
                catch {
                  frameIds = [0]
                }
              }
              lastFrames = frameIds.map(frameId => ({ frameId }))
            }

            const lastError = lastPollError || lastFrameError || undefined
            resolve(lastFrames.map(entry => ({
              frameId: entry.frameId,
              result: {
                error: `timed out waiting for selector "${selector}"`,
                selector,
                success: false,
                timeoutMs,
                ...(lastError ? { lastError } : {}),
              },
            })))
          }

          async function poll() {
            const remainingMs = deadline - Date.now()
            if (remainingMs <= 0) {
              await resolveTimeout()
              return
            }

            try {
              const frames = await runCUAction(tabId, cmd.frameIds || null, 'findElements', [selector, 1], {
                timeoutMs: remainingMs,
              })
              lastFrames = frames
              const frameErrors = frames
                .map(entry => unwrapBridgePayload(entry.result))
                .filter(payload => payload && payload.success === false && typeof payload.error === 'string')
                .map(payload => payload.error)
              if (frameErrors.length > 0) {
                lastFrameError = frameErrors.join('; ')
              }

              const found = frames.some((entry) => {
                const payload = unwrapBridgePayload(entry.result)
                return payload && payload.success && Array.isArray(payload.elements) && payload.elements.length > 0
              })
              if (found) {
                resolve(frames)
                return
              }
            }
            catch (e) {
              lastPollError = e?.message || String(e)
            }

            const nextDelayMs = Math.min(WAIT_FOR_ELEMENT_POLL_INTERVAL_MS, Math.max(0, deadline - Date.now()))
            if (nextDelayMs <= 0) {
              await resolveTimeout()
              return
            }
            setTimeout(poll, nextDelayMs)
          }
          poll()
        })
        break
      }

      default:
        return { error: `unknown action: ${action}`, id, ok: false }
    }

    return { id, ok: true, result }
  }
  catch (e) {
    return { error: e.message || String(e), id, ok: false }
  }
}

function mergePayloadWithFrameOffset(result, frameOffset) {
  if (!frameOffset || typeof frameOffset.x !== 'number' || typeof frameOffset.y !== 'number')
    return result

  if (!result || typeof result !== 'object')
    return result

  if (result.data && typeof result.data === 'object') {
    return {
      ...result,
      data: {
        ...result.data,
        frameOffset,
      },
    }
  }

  return {
    ...result,
    frameOffset,
  }
}

function normalizeUrl(value) {
  if (typeof value !== 'string' || value.trim() === '')
    return ''

  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString()
  }
  catch {
    return value.trim()
  }
}

// ---- Tab / Frame utilities ----

function pickBestChildAnchor(parentAnchors, childMeta, siblingCount) {
  if (!Array.isArray(parentAnchors) || parentAnchors.length === 0)
    return null

  // NOTICE: Chrome's extension frame tree does not expose iframe screen bounds.
  // We reconstruct child-frame origins by matching the webNavigation frame tree
  // back to iframe shells discovered in the parent document. URL/name/title
  // matching is a heuristic, but it is materially better than treating every
  // subframe rect as top-level viewport coordinates.
  const childUrl = normalizeUrl(childMeta.url)
  const childFrameName = typeof childMeta.frameName === 'string' ? childMeta.frameName.trim() : ''
  const childTitle = typeof childMeta.title === 'string' ? childMeta.title.trim() : ''

  let best = null
  let bestScore = -1

  for (const anchor of parentAnchors) {
    if (!anchor || typeof anchor !== 'object' || !anchor.rect)
      continue

    let score = 0
    const anchorSrc = normalizeUrl(anchor.src)
    const anchorContentUrl = normalizeUrl(anchor.contentUrl)
    const anchorName = typeof anchor.name === 'string' ? anchor.name.trim() : ''
    const anchorTitle = typeof anchor.title === 'string' ? anchor.title.trim() : ''

    if (childUrl && anchorContentUrl && anchorContentUrl === childUrl)
      score += 100
    else if (childUrl && anchorSrc && anchorSrc === childUrl)
      score += 90
    else if (childUrl && anchorSrc && childUrl.startsWith(anchorSrc))
      score += 70

    if (childFrameName && anchorName && anchorName === childFrameName)
      score += 40

    if (childTitle && anchorTitle && anchorTitle === childTitle)
      score += 15

    if (siblingCount === 1 && parentAnchors.length === 1)
      score += 10

    if (score > bestScore) {
      bestScore = score
      best = anchor
    }
  }

  return bestScore > 0 ? best : null
}

// ---- Core: route commands to content.js via msg_bridge.js ----

async function readAllFramesDOMWithOffsets(tabId, frameIds, opts) {
  const frameInfos = await chrome.webNavigation.getAllFrames({ tabId })
  const targetIds = Array.isArray(frameIds) && frameIds.length > 0
    ? frameIds
    : frameInfos.map(frame => frame.frameId)
  const domResults = await runCUAction(tabId, targetIds, 'collectFrameDOM', [opts || {}])
  const parentAnchorsByFrameId = await readParentFrameAnchors(tabId, frameInfos, targetIds)
  const frameOffsets = buildFrameOffsets(frameInfos, domResults, parentAnchorsByFrameId)

  return domResults.map((entry) => {
    const frameOffset = frameOffsets.get(entry.frameId) || null
    return {
      ...entry,
      result: mergePayloadWithFrameOffset(entry.result, frameOffset),
    }
  })
}

async function readParentFrameAnchors(tabId, frameInfos, targetFrameIds) {
  const targetIdSet = new Set(Array.isArray(targetFrameIds) ? targetFrameIds : frameInfos.map(frame => frame.frameId))
  const parentFrameIds = [...new Set(
    frameInfos
      .filter(frame => targetIdSet.has(frame.frameId))
      .map(frame => frame.parentFrameId)
      .filter(parentFrameId => typeof parentFrameId === 'number' && parentFrameId >= 0),
  )]

  const anchorMap = new Map()
  await Promise.all(parentFrameIds.map(async (parentFrameId) => {
    const response = await sendCUAction(tabId, parentFrameId, 'collectChildFrames', [])
    const payload = unwrapBridgePayload(response)
    const childFrames = Array.isArray(payload?.childFrames) ? payload.childFrames : []
    anchorMap.set(parentFrameId, childFrames)
  }))

  return anchorMap
}

/**
 * Send a CU_ACTION message to a specific tab + frame.
 * msg_bridge.js (ISOLATED world) receives → postMessage → content.js (MAIN world)
 */
function resolveActionTimeoutMs(timeoutMs) {
  const numericTimeout = Number(timeoutMs)
  if (!Number.isFinite(numericTimeout) || numericTimeout <= 0)
    return SEND_CU_ACTION_TIMEOUT_MS

  return Math.max(1, Math.min(Math.ceil(numericTimeout), SEND_CU_ACTION_TIMEOUT_MS))
}

/**
 * Run a CU_ACTION across all frames (or specified frames) in a tab.
 * Returns [{frameId, result}]
 */
async function runCUAction(tabId, frameIds, method, args, options = {}) {
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
      const result = await sendCUAction(tabId, fid, method, args, options)
      return { frameId: fid, result }
    }),
  )
}

function scheduleBridgeReconnect() {
  if (bridgeReconnectTimer)
    return

  const delay = bridgeReconnectDelayMs
  bridgeReconnectDelayMs = Math.min(bridgeReconnectDelayMs * 2, BRIDGE_RECONNECT_MAX_MS)
  bridgeReconnectTimer = setTimeout(() => {
    bridgeReconnectTimer = null
    ensureBridgeConnected().catch(() => {})
  }, delay)
}

function sendBridgePayload(payload) {
  if (!bridgeSocket || bridgeSocket.readyState !== WebSocket.OPEN)
    return false

  bridgeSocket.send(JSON.stringify(payload))
  return true
}

async function sendCUAction(tabId, frameId, method, args, options = {}) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ error: 'sendMessage timeout', success: false })
    }, resolveActionTimeoutMs(options.timeoutMs))

    try {
      chrome.tabs.sendMessage(
        tabId,
        { args: args || [], method, type: 'CU_ACTION' },
        { frameId },
        (response) => {
          clearTimeout(timeout)
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message, success: false })
          }
          else {
            resolve(response || { error: 'no response', success: false })
          }
        },
      )
    }
    catch (e) {
      clearTimeout(timeout)
      resolve({ error: e.message || String(e), success: false })
    }
  })
}

// ---- Handle external commands (from AIRI extension bridge) ----

function unwrapBridgePayload(value) {
  if (!value || typeof value !== 'object')
    return value

  if (value.data && typeof value.data === 'object')
    return value.data

  return value
}

// ---- Listen for external messages ----
// The AIRI BrowserDomExtensionBridge connects via chrome.runtime.onMessageExternal
// or through the existing WebSocket bridge mechanism

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'AIRI_DG_COMMAND') {
    handleCommand(msg.data)
      .then(resp => sendResponse(resp))
      .catch(e => sendResponse({ error: String(e), ok: false }))
    return true // Keep sendResponse async
  }

  // Support the existing ws-incoming format from BrowserDomExtensionBridge
  if (msg.type === 'ws-incoming') {
    handleCommand(msg.data)
      .then((resp) => {
        // Send response back via the same channel
        chrome.runtime.sendMessage({ data: resp, type: 'ws-send' })
      })
      .catch((e) => {
        chrome.runtime.sendMessage({ data: { error: String(e), id: msg.data?.id, ok: false }, type: 'ws-send' })
      })
    return false
  }

  return false
})

chrome.runtime.onStartup?.addListener(() => {
  ensureBridgeConnected().catch(() => {})
})

chrome.runtime.onInstalled?.addListener(() => {
  ensureBridgeConnected().catch(() => {})
})

ensureBridgeConnected().catch(() => {})
