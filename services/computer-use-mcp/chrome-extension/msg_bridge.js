/**
 * msg_bridge.js — ISOLATED world message bridge
 *
 * Architecture:
 *   background.js  --chrome.tabs.sendMessage-->  msg_bridge.js (ISOLATED)
 *                                                      |
 *                                              window.postMessage
 *                                                      |
 *                                                content.js (MAIN world, __AIRI_DG__)
 *                                                      |
 *                                              window.postMessage (reply)
 *                                                      |
 *   background.js  <--sendResponse--          msg_bridge.js (ISOLATED)
 *
 * Why this bridge is needed:
 * - chrome.runtime.onMessage can only be received in the ISOLATED world
 * - window.__AIRI_DG__ lives in the MAIN world (needs real DOM access)
 * - The two worlds communicate via window.postMessage
 *
 * Adapted from /Users/liuziheng/computer_use/chrome-extension/msg_bridge.js.
 * No functional changes — this is a pure relay.
 */
(function () {
  'use strict'

  // Pending requests: reqId → { sendResponse, timer }
  const pending = new Map()
  let seqId = 0

  // Receive commands from background.js
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== 'CU_ACTION')
      return false

    const reqId = `__cu_req_${++seqId}`
    const { method, args } = msg

    // Set timeout
    const timer = setTimeout(() => {
      pending.delete(reqId)
      sendResponse({ success: false, error: 'timeout' })
    }, 8000)

    pending.set(reqId, { sendResponse, timer })

    // Send to MAIN world content.js
    window.postMessage({
      type: '__CU_CALL__',
      reqId,
      method,
      args: args || [],
    }, '*')

    return true // Keep sendResponse async
  })

  // Receive replies from MAIN world content.js
  window.addEventListener('message', (evt) => {
    if (evt.source !== window)
      return
    const data = evt.data
    if (!data || data.type !== '__CU_REPLY__')
      return

    const entry = pending.get(data.reqId)
    if (!entry)
      return

    pending.delete(data.reqId)
    clearTimeout(entry.timer)
    entry.sendResponse(data.result)
  })
})()
