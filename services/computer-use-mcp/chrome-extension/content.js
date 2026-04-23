/**
 * content.js — AIRI Desktop Grounding: read-only DOM observation
 *
 * Injected into every frame (including cross-origin iframes) in the MAIN world.
 * Namespace: window.__AIRI_DG__
 *
 * IMPORTANT: Direct DOM mutations here are limited to bridge-triggered write
 * actions (setInputValue, checkCheckbox, selectOption) that are only reachable
 * via a WebSocket command from the AIRI computer-use-mcp service. Physical
 * pointer/keyboard actions still go through real macOS OS-level input.
 *
 * Adapted from /Users/liuziheng/computer_use/chrome-extension/content.js.
 * Stripped: clickAt, typeAt, hoverAt, scrollAt, simulateDragDrop, readStorage,
 * setStorage, readCanvasData, injectCSS, and all other untracked DOM mutations.
 * Kept: collectFrameDOM, _describeElement, _collectInteractiveElements,
 * findElement, findElements, getClickTarget.
 * Added: setInputValue, checkCheckbox, selectOption.
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
        bodyText: includeText ? (document.body ? document.body.innerText || '' : '').slice(0, 3000) : '',
        interactiveElements: _collectInteractiveElements(maxElements),
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
     *
     * Coordinates are exposed both at the top level (x, y) and under
     * `center` for backward compatibility. The extension bridge reads
     * top-level x/y via unwrapResultPayload.
     */
    getClickTarget(selector) {
      try {
        const el = document.querySelector(selector)
        if (!el)
          return { success: false, error: 'not found' }
        const r = el.getBoundingClientRect()
        const x = Math.round(r.left + r.width / 2)
        const y = Math.round(r.top + r.height / 2)
        return {
          success: true,
          element: _describeElement(el),
          // Top-level x/y are read by extension-bridge.ts → clickSelector
          x,
          y,
          // Keep center for any callers that read it directly
          center: { x, y },
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

    /**
     * Set the value of a text input or textarea via the DOM.
     * Dispatches input + change events so frameworks (React, Vue, etc.) detect
     * the change. Optionally blurs the element when done.
     */
    setInputValue(selector, value, opts) {
      try {
        opts = opts || {}
        const el = document.querySelector(selector)
        if (!el)
          return { success: false, error: 'not found' }
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
          || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
        if (nativeInputValueSetter && nativeInputValueSetter.set) {
          nativeInputValueSetter.set.call(el, value)
        }
        else {
          el.value = value
        }
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        if (opts.blur)
          el.blur()
        return { success: true }
      }
      catch (e) {
        return { success: false, error: e.message }
      }
    },

    /**
     * Check or uncheck a checkbox/radio input.
     * Dispatches a click event to trigger framework listeners.
     */
    checkCheckbox(selector, checked) {
      try {
        const el = document.querySelector(selector)
        if (!el)
          return { success: false, error: 'not found' }
        const target = checked !== undefined ? !!checked : !el.checked
        if (el.checked !== target) {
          el.checked = target
          el.dispatchEvent(new Event('change', { bubbles: true }))
          el.dispatchEvent(new Event('click', { bubbles: true }))
        }
        return { success: true, checked: el.checked }
      }
      catch (e) {
        return { success: false, error: e.message }
      }
    },

    /**
     * Select an option in a <select> element by value.
     * Dispatches change event so framework bindings update.
     */
    selectOption(selector, value) {
      try {
        const el = document.querySelector(selector)
        if (!el)
          return { success: false, error: 'not found' }
        el.value = value
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return { success: true, selectedValue: el.value }
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
