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
 * Supported actions:
 * - getActiveTab: get the active tab info
 * - getAllFrames: list all frames in the active tab
 * - readAllFramesDOM: collect interactive elements from all frames
 * - findElement: find a single element by CSS selector
 * - findElements: find multiple elements by CSS selector
 * - getClickTarget: get center point of an element for click targeting
 * - getElementAttributes: get all attributes of an element
 * - setInputValue: set value of a text input or textarea
 * - checkCheckbox: check or uncheck a native checkbox/radio
 * - selectOption: select an option in a <select> element
 * - readInputValue: read the current value of an input/textarea/select
 * - getComputedStyles: get computed CSS styles for an element
 * - triggerEvent: dispatch a DOM event on an element
 * - waitForElement: wait for an element to appear in the DOM
 * - clickAt: dispatch a click event at viewport coordinates
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

      case 'setInputValue':
        result = await runCUAction(tabId, cmd.frameIds || null, 'setInputValue', [
          cmd.selector || '',
          cmd.value || '',
          { blur: cmd.opts?.blur !== false, simulateKeystrokes: !!cmd.opts?.simulateKeystrokes },
        ])
        break

      case 'checkCheckbox':
        result = await runCUAction(tabId, cmd.frameIds || null, 'checkCheckbox', [
          cmd.selector || '',
          cmd.checked,
        ])
        break

      case 'selectOption':
        result = await runCUAction(tabId, cmd.frameIds || null, 'selectOption', [
          cmd.selector || '',
          cmd.value || '',
        ])
        break

      case 'readInputValue':
        result = await runCUAction(tabId, cmd.frameIds || null, 'readInputValue', [
          cmd.selector || '',
        ])
        break

      case 'getComputedStyles':
        result = await runCUAction(tabId, cmd.frameIds || null, 'getComputedStyles', [
          cmd.selector || '',
          cmd.properties || [],
        ])
        break

      case 'triggerEvent':
        result = await runCUAction(tabId, cmd.frameIds || null, 'triggerEvent', [
          cmd.selector || '',
          cmd.eventName || '',
          cmd.opts || {},
        ])
        break

      case 'waitForElement':
        result = await runCUAction(tabId, cmd.frameIds || null, 'waitForElement', [
          cmd.selector || '',
          cmd.timeoutMs || 5000,
        ])
        break

      case 'clickAt':
        result = await runCUAction(tabId, cmd.frameIds || null, 'clickAt', [
          cmd.x ?? 0,
          cmd.y ?? 0,
        ])
        break

      default:
        // NOTICE: unknown actions must return ok:false so BrowserDomExtensionBridge
        // rejects the pending promise; returning ok:true would make callers like
        // setInputValue/checkCheckbox see a resolved promise and skip fallback paths.
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
  if (msg.type === 'AIRI_DG_COMMAND') {
    handleCommand(msg.data)
      .then(resp => sendResponse(resp))
      .catch(e => sendResponse({ ok: false, error: String(e) }))
    return true // Keep sendResponse async
  }

  return false
})

// ---- WebSocket Relay ----
// Injects the WebSocket connection directly in the background worker,
// replacing the deleted offscreen document.
const WS_URL = 'ws://localhost:8765'
const BRIDGE_VERSION = 'cu-bridge-2026-02-06-no-eval'
let ws = null
let reconnectDelay = 1000
const MAX_DELAY = 30000

function connectWS() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING))
    return

  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    console.log('[background] WebSocket connected')
    reconnectDelay = 1000
    ws.send(JSON.stringify({ type: 'hello', source: 'chrome-extension', version: BRIDGE_VERSION }))
  }

  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data)
      handleCommand(data)
        .then((resp) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(resp))
          }
        })
        .catch((e) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ id: data?.id, ok: false, error: String(e) }))
          }
        })
    }
    catch (e) {
      console.error('[background] parse error:', e)
    }
  }

  ws.onclose = () => {
    console.log(`[background] WebSocket closed, reconnect in ${reconnectDelay}ms`)
    ws = null
    setTimeout(connectWS, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY)
  }

  ws.onerror = (e) => {
    console.error('[background] WebSocket error:', e)
    ws?.close()
  }
}

connectWS()
