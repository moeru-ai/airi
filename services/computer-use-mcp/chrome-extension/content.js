/**
 * content.js — AIRI Desktop Grounding: read-only DOM observation
 *
 * Injected into every frame (including cross-origin iframes) in the MAIN world.
 * Namespace: window.__AIRI_DG__
 *
 * IMPORTANT: This script is READ-ONLY. It does NOT perform any DOM mutations,
 * clicks, typing, or navigation. All execution is done via real macOS OS-level
 * input events through the desktop grounding executor.
 *
 * Adapted from /Users/liuziheng/computer_use/chrome-extension/content.js.
 * Stripped: clickAt, typeAt, hoverAt, scrollAt, simulateDragDrop, readStorage,
 * setStorage, readCanvasData, injectCSS, and all other DOM-mutating methods.
 * Kept: collectFrameDOM, _describeElement, _collectInteractiveElements,
 * findElement, findElements, getClickTarget.
 */
(function () {
  'use strict'
  if (window.__AIRI_DG__)
    return // Prevent re-entry

  const MAX_INTERACTIVE = 200

  // ---- Element description ----

  /**
   * Describe a single DOM element with its tag, attributes, text, rect.
   * Returns null for non-element nodes or invisible elements.
   */
  function _describeElement(el) {
    if (!el || el.nodeType !== 1)
      return null
    const r = el.getBoundingClientRect()
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      name: el.name || '',
      type: el.type || '',
      className: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
      text: (el.innerText || el.textContent || '').slice(0, 120).trim(),
      value: el.value !== undefined ? String(el.value).slice(0, 60) : '',
      href: el.href || '',
      placeholder: el.placeholder || '',
      role: el.getAttribute('role') || '',
      disabled: !!el.disabled,
      checked: !!el.checked,
      visible: r.width > 0 && r.height > 0,
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    }
  }

  /**
   * Collect visible interactive elements from the current frame.
   * Targets: links, buttons, inputs, textareas, selects, and elements with
   * interactive ARIA roles or tabindex.
   */
  function _collectInteractiveElements(maxCount) {
    const n = maxCount || MAX_INTERACTIVE
    const selectors = 'a,button,input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="radio"],[onclick],[tabindex]'
    const nodes = document.querySelectorAll(selectors)
    const els = []
    for (let i = 0; i < nodes.length && els.length < n; i++) {
      const d = _describeElement(nodes[i])
      if (d && d.visible)
        els.push(d)
    }
    return els
  }

  /**
   * Collect direct child frame anchors in the current frame.
   *
   * NOTICE: This only describes the iframe/frame shell that lives in the
   * current document. The background worker uses these anchors together with
   * the Chrome frame tree to reconstruct per-frame viewport offsets.
   */
  function _collectChildFrames() {
    const nodes = document.querySelectorAll('iframe,frame')
    const frames = []

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const r = node.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0)
        continue

      let contentUrl = ''
      try {
        contentUrl = node.contentWindow?.location?.href || ''
      }
      catch {
        // Cross-origin child frames cannot reveal contentWindow.location here.
      }

      frames.push({
        index: i,
        id: node.id || '',
        name: node.name || '',
        title: node.getAttribute('title') || '',
        src: node.getAttribute('src') || '',
        contentUrl,
        rect: {
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height),
        },
      })
    }

    return frames
  }

  function _readFrameOffsetInParent() {
    if (window.top === window) {
      return { x: 0, y: 0 }
    }

    try {
      const frameEl = window.frameElement
      if (!frameEl)
        return null

      const r = frameEl.getBoundingClientRect()
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
      }
    }
    catch {
      return null
    }
  }

  // ---- Core API (read-only) ----

  const __AIRI_DG__ = {
    version: '1.0-airi-dg',

    /**
     * Collect the DOM structure of the current frame.
     * Returns URL, title, body text (optional), and interactive elements.
     */
    collectFrameDOM(opts) {
      opts = opts || {}
      const includeText = opts.includeText !== false
      const maxElements = opts.maxElements || MAX_INTERACTIVE
      return {
        url: location.href,
        title: document.title || '',
        frameName: window.name || '',
        frameOffsetInParent: _readFrameOffsetInParent(),
        bodyText: includeText ? (document.body ? document.body.innerText || '' : '').slice(0, 3000) : '',
        interactiveElements: _collectInteractiveElements(maxElements),
      }
    },

    /**
     * Describe direct child iframe/frame shells in the current document.
     */
    collectChildFrames() {
      return {
        childFrames: _collectChildFrames(),
      }
    },

    /**
     * Find a single element by CSS selector and describe it.
     */
    findElement(selector) {
      try {
        const el = document.querySelector(selector)
        if (!el)
          return { success: false, error: 'not found' }
        return { success: true, element: _describeElement(el) }
      }
      catch (e) {
        return { success: false, error: e.message }
      }
    },

    /**
     * Find multiple elements by CSS selector and describe them.
     */
    findElements(selector, max) {
      try {
        const nodes = document.querySelectorAll(selector)
        const results = []
        const limit = max || 10
        for (let i = 0; i < nodes.length && results.length < limit; i++) {
          const d = _describeElement(nodes[i])
          if (d)
            results.push(d)
        }
        return { success: true, elements: results }
      }
      catch (e) {
        return { success: false, error: e.message }
      }
    },

    /**
     * Get the center point of an element for click targeting.
     * Returns the element description with center coordinates.
     */
    getClickTarget(selector) {
      try {
        const el = document.querySelector(selector)
        if (!el)
          return { success: false, error: 'not found' }
        const r = el.getBoundingClientRect()
        return {
          success: true,
          element: _describeElement(el),
          center: {
            x: Math.round(r.left + r.width / 2),
            y: Math.round(r.top + r.height / 2),
          },
        }
      }
      catch (e) {
        return { success: false, error: e.message }
      }
    },

    /**
     * Get element attributes for debugging.
     */
    getElementAttributes(selector) {
      try {
        const el = document.querySelector(selector)
        if (!el)
          return { success: false, error: 'not found' }
        const attrs = {}
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value
        }
        return { success: true, attributes: attrs }
      }
      catch (e) {
        return { success: false, error: e.message }
      }
    },
  }

  window.__AIRI_DG__ = __AIRI_DG__

  // ---- Message handler: ISOLATED world bridge → MAIN world ----
  window.addEventListener('message', (evt) => {
    if (evt.source !== window)
      return
    const data = evt.data
    if (!data || data.type !== '__CU_CALL__')
      return

    const { reqId, method, args } = data
    const fn = __AIRI_DG__[method]
    let result

    if (typeof fn === 'function') {
      try {
        result = { success: true, data: fn.apply(__AIRI_DG__, args || []) }
      }
      catch (e) {
        result = { success: false, error: e.message || String(e) }
      }
    }
    else {
      result = { success: false, error: `unknown method: ${method}` }
    }

    window.postMessage({ type: '__CU_REPLY__', reqId, result }, '*')
  })
})()
