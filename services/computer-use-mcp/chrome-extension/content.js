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
 * Adapted from the repository's Chrome extension source.
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
      checked: !!el.checked,
      className: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
      disabled: !!el.disabled,
      href: el.href || '',
      id: el.id || '',
      name: el.name || '',
      placeholder: el.placeholder || '',
      rect: { h: Math.round(r.height), w: Math.round(r.width), x: Math.round(r.left), y: Math.round(r.top) },
      role: el.getAttribute('role') || '',
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').slice(0, 120).trim(),
      type: el.type || '',
      value: el.value !== undefined ? String(el.value).slice(0, 60) : '',
      visible: r.width > 0 && r.height > 0,
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
        contentUrl,
        id: node.id || '',
        index: i,
        name: node.name || '',
        rect: {
          h: Math.round(r.height),
          w: Math.round(r.width),
          x: Math.round(r.left),
          y: Math.round(r.top),
        },
        src: node.getAttribute('src') || '',
        title: node.getAttribute('title') || '',
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
    /**
     * Describe direct child iframe/frame shells in the current document.
     */
    collectChildFrames() {
      return {
        childFrames: _collectChildFrames(),
      }
    },

    /**
     * Collect the DOM structure of the current frame.
     * Returns URL, title, body text (optional), and interactive elements.
     */
    collectFrameDOM(opts) {
      opts = opts || {}
      const includeText = opts.includeText !== false
      const maxElements = opts.maxElements || MAX_INTERACTIVE
      return {
        bodyText: includeText ? (document.body?.textContent || '').slice(0, 3000) : '',
        frameName: window.name || '',
        frameOffsetInParent: _readFrameOffsetInParent(),
        interactiveElements: _collectInteractiveElements(maxElements),
        title: document.title || '',
        url: location.href,
      }
    },

    /**
     * Find a single element by CSS selector and describe it.
     */
    findElement(selector) {
      try {
        const el = document.querySelector(selector)
        if (!el)
          return { error: 'not found', success: false }
        return { element: _describeElement(el), success: true }
      }
      catch (e) {
        return { error: e.message, success: false }
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
        return { elements: results, success: true }
      }
      catch (e) {
        return { error: e.message, success: false }
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
          return { error: 'not found', success: false }
        const r = el.getBoundingClientRect()
        return {
          center: {
            x: Math.round(r.left + r.width / 2),
            y: Math.round(r.top + r.height / 2),
          },
          element: _describeElement(el),
          success: true,
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
        }
      }
      catch (e) {
        return { error: e.message, success: false }
      }
    },

    /**
     * Read computed CSS styles of an element.
     * If `properties` is provided, return only those properties.
     * Otherwise return a controlled default set to avoid dumping the full
     * CSSStyleDeclaration (which can be multi-KB).
     */
    getComputedStyles(selector, properties) {
      const DEFAULT_PROPERTIES = [
        'display',
        'visibility',
        'opacity',
        'position',
        'width',
        'height',
        'color',
        'background-color',
        'font-size',
        'font-family',
        'overflow',
        'z-index',
        'pointer-events',
        'cursor',
      ]

      try {
        const el = document.querySelector(selector)
        if (!el)
          return { error: 'not found', success: false }

        const computed = window.getComputedStyle(el)
        const props = Array.isArray(properties) && properties.length > 0
          ? properties
          : DEFAULT_PROPERTIES
        const styles = Object.create(null)

        for (const prop of props) {
          styles[prop] = computed.getPropertyValue(prop)
        }

        return { styles, success: true }
      }
      catch (e) {
        return { error: e.message, success: false }
      }
    },

    /**
     * Get element attributes for debugging.
     */
    getElementAttributes(selector) {
      try {
        const el = document.querySelector(selector)
        if (!el)
          return { error: 'not found', success: false }
        const attrs = {}
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value
        }
        return { attributes: attrs, success: true }
      }
      catch (e) {
        return { error: e.message, success: false }
      }
    },

    /**
     * Read the current value of an input, textarea, or select element.
     * Returns value plus basic element metadata. Read-only: no DOM mutation.
     */
    readInputValue(selector) {
      try {
        const el = document.querySelector(selector)
        if (!el)
          return { error: 'not found', success: false }

        const tag = el.tagName.toLowerCase()
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select')
          return { error: 'element is not an input, textarea, or select', success: false }

        const type = typeof el.type === 'string' ? el.type : ''
        const rawValue = String(el.value ?? '')
        const isPassword = tag === 'input' && type.toLowerCase() === 'password'
        const result = {
          id: el.id || '',
          name: el.name || '',
          tag,
          type,
          value: isPassword ? '[redacted]' : rawValue.slice(0, 60),
          valueLength: rawValue.length,
          valueRedacted: isPassword,
          valueTruncated: !isPassword && rawValue.length > 60,
        }

        if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
          result.checked = !!el.checked
        }

        if (tag === 'select') {
          result.selectedIndex = el.selectedIndex
          result.selectedText = el.selectedIndex >= 0 && el.options[el.selectedIndex]
            ? el.options[el.selectedIndex].text.slice(0, 120)
            : ''
        }

        return { success: true, ...result }
      }
      catch (e) {
        return { error: e.message, success: false }
      }
    },

    version: '1.0-airi-dg',
  }

  window.__AIRI_DG__ = __AIRI_DG__

  // ---- Message handler: ISOLATED world bridge → MAIN world ----
  window.addEventListener('message', (evt) => {
    if (evt.source !== window)
      return
    const data = evt.data
    if (!data || data.type !== '__CU_CALL__')
      return

    const { args, method, reqId } = data
    const fn = __AIRI_DG__[method]
    let result

    if (typeof fn === 'function') {
      try {
        result = { data: fn.apply(__AIRI_DG__, args || []), success: true }
      }
      catch (e) {
        result = { error: e.message || String(e), success: false }
      }
    }
    else {
      result = { error: `unknown method: ${method}`, success: false }
    }

    window.postMessage({ reqId, result, type: '__CU_REPLY__' }, '*')
  })
})()
