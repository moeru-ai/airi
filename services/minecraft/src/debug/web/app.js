/**
 * Debug Dashboard - Multi-View Application
 * All panels visible simultaneously, focus on robustness and utility
 */

// =============================================================================
// Configuration & Constants
// =============================================================================

const CONFIG = {
  MAX_LOGS: 500,
  MAX_LLM_TRACES: 50,
  RECONNECT_MAX_ATTEMPTS: 10,
  RECONNECT_DELAY: 1000,
  PING_INTERVAL: 25000,
  UPDATE_THROTTLE: 100, // ms
}

// =============================================================================
// Utility Functions
// =============================================================================

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function throttle(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

// =============================================================================
// WebSocket Client
// =============================================================================

class DebugClient {
  constructor() {
    this.ws = null
    this.reconnectAttempts = 0
    this.pingInterval = null
    this.messageIdCounter = 0
    this.eventHandlers = new Map()
  }

  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType).push(handler)
  }

  emit(eventType, data) {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data)
        }
        catch (err) {
          console.error(`Error in ${eventType} handler:`, err)
        }
      })
    }
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}`

    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.updateConnectionStatus(true)
      this.startPing()
      this.emit('connected')
    }

    this.ws.onclose = () => {
      this.updateConnectionStatus(false)
      this.stopPing()
      this.scheduleReconnect()
    }

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err)
    }

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data)
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.stopPing()
  }

  reconnect() {
    this.disconnect()
    this.reconnectAttempts = 0
    this.connect()
  }

  send(command) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = {
        id: `${++this.messageIdCounter}`,
        data: command,
        timestamp: Date.now(),
      }
      this.ws.send(JSON.stringify(message))
    }
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data)
      const event = message.data

      if (event.type === 'history') {
        for (const historyEvent of event.payload) {
          this.routeEvent(historyEvent)
        }
        return
      }

      if (event.type === 'pong') {
        return
      }

      this.routeEvent(event)
    }
    catch (err) {
      console.error('Failed to parse message:', err)
    }
  }

  routeEvent(event) {
    this.emit(event.type, event.payload)
  }

  updateConnectionStatus(connected) {
    const dot = document.getElementById('connection-status')
    const text = document.getElementById('status-text')

    if (connected) {
      dot.classList.add('connected')
      text.textContent = 'Connected'
    }
    else {
      dot.classList.remove('connected')
      text.textContent = 'Disconnected'
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= CONFIG.RECONNECT_MAX_ATTEMPTS) {
      console.log('Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = CONFIG.RECONNECT_DELAY * Math.min(this.reconnectAttempts, 5)

    const text = document.getElementById('status-text')
    text.textContent = `Reconnecting (${this.reconnectAttempts})...`

    setTimeout(() => this.connect(), delay)
  }

  startPing() {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping', payload: { timestamp: Date.now() } })
    }, CONFIG.PING_INTERVAL)
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }
}

// =============================================================================
// Queue Panel
// =============================================================================

class QueuePanel {
  constructor(client) {
    this.client = client
    this.data = { queue: [], processing: null }
    this.elements = {
      queueList: document.getElementById('queue-list'),
      queueCount: document.getElementById('queue-count'),
      processingContent: document.getElementById('processing-content'),
      statQueue: document.getElementById('stat-queue'),
    }
  }

  init() {
    this.client.on('queue', data => this.update(data))
    this.client.on('connected', () => this.reset())
    this.render()
  }

  update(data) {
    this.data = data
    this.render()
  }

  reset() {
    this.data = { queue: [], processing: null }
    this.render()
  }

  render() {
    const { queue, processing } = this.data

    // Queue count
    const queueSize = queue?.length || 0
    this.elements.queueCount.textContent = queueSize
    this.elements.statQueue.textContent = queueSize

    // Queue list
    if (queue && queue.length > 0) {
      this.elements.queueList.innerHTML = queue.map((item, idx) => `
        <div class="queue-item">
          <span class="queue-index">#${idx + 1}</span>
          <span class="queue-type">${escapeHtml(item.type)}</span>
          <span class="queue-source">${escapeHtml(item.source?.id || 'unknown')}</span>
        </div>
      `).join('')
    }
    else {
      this.elements.queueList.innerHTML = '<div class="empty-state">Queue empty</div>'
    }

    // Processing
    if (processing) {
      this.elements.processingContent.innerHTML = `
        <div class="processing-active">
          <strong>${escapeHtml(processing.type)}</strong>
          <div style="color: var(--text-secondary); font-size: 11px; margin-top: 4px;">
            Source: ${escapeHtml(processing.source?.type)}/${escapeHtml(processing.source?.id)}
          </div>
        </div>
      `
    }
    else {
      this.elements.processingContent.innerHTML = '<span style="color: var(--text-muted);">Idle</span>'
    }
  }
}

// =============================================================================
// Blackboard Panel
// =============================================================================

class BlackboardPanel {
  constructor(client) {
    this.client = client
    this.state = {}
    this.elements = {
      json: document.getElementById('blackboard-json'),
      copyBtn: document.getElementById('blackboard-copy-btn'),
    }
  }

  init() {
    this.client.on('blackboard', data => this.update(data))
    this.client.on('connected', () => this.reset())
    this.elements.copyBtn.addEventListener('click', () => this.copy())
    this.render()
  }

  update(data) {
    this.state = data.state || {}
    this.render()
  }

  reset() {
    this.state = {}
    this.render()
  }

  render() {
    this.elements.json.textContent = JSON.stringify(this.state, null, 2)
  }

  copy() {
    navigator.clipboard.writeText(JSON.stringify(this.state, null, 2))
      .then(() => {
        this.elements.copyBtn.textContent = '✓'
        setTimeout(() => { this.elements.copyBtn.textContent = '📋' }, 1000)
      })
      .catch(err => console.error('Copy failed:', err))
  }
}

// =============================================================================
// Logs Panel
// =============================================================================

class LogsPanel {
  constructor(client) {
    this.client = client
    this.logs = []
    this.autoScroll = true
    this.paused = false
    this.filter = { level: 'all', search: '' }
    this.elements = {
      container: document.getElementById('logs-container'),
      search: document.getElementById('log-search'),
      levelFilter: document.getElementById('log-level-filter'),
      autoScroll: document.getElementById('auto-scroll'),
      statEvents: document.getElementById('stat-events'),
    }
  }

  init() {
    this.client.on('log', data => this.addLog(data))
    this.client.on('connected', () => this.reset())

    this.elements.search.addEventListener('input', (e) => {
      this.filter.search = e.target.value.toLowerCase()
      this.renderThrottled()
    })

    this.elements.levelFilter.addEventListener('change', (e) => {
      this.filter.level = e.target.value
      this.renderThrottled()
    })

    this.elements.autoScroll.addEventListener('change', (e) => {
      this.autoScroll = e.target.checked
    })

    this.renderThrottled = throttle(() => this.render(), CONFIG.UPDATE_THROTTLE)
    this.render()
  }

  addLog(entry) {
    if (this.paused)
      return

    this.logs.push(entry)
    if (this.logs.length > CONFIG.MAX_LOGS) {
      this.logs.shift()
    }

    this.elements.statEvents.textContent = this.logs.length
    this.renderThrottled()
  }

  reset() {
    this.logs = []
    this.elements.statEvents.textContent = '0'
    this.render()
  }

  clear() {
    this.logs = []
    this.elements.statEvents.textContent = '0'
    this.render()
  }

  setPaused(paused) {
    this.paused = paused
  }

  render() {
    const filtered = this.logs.filter((log) => {
      if (this.filter.level !== 'all' && log.level !== this.filter.level) {
        return false
      }
      if (this.filter.search && !log.message.toLowerCase().includes(this.filter.search)) {
        return false
      }
      return true
    })

    this.elements.container.innerHTML = filtered.map((log) => {
      const time = new Date(log.timestamp).toLocaleTimeString()
      const fieldsStr = log.fields ? JSON.stringify(log.fields) : ''

      return `
        <div class="log-entry">
          <span class="log-time">${time}</span>
          <span class="log-level level-${log.level}">[${log.level}]</span>
          <span class="log-message">${escapeHtml(log.message)}</span>
          ${fieldsStr ? `<div class="log-fields">${escapeHtml(fieldsStr)}</div>` : ''}
        </div>
      `
    }).join('')

    if (this.autoScroll) {
      this.elements.container.scrollTop = this.elements.container.scrollHeight
    }
  }
}

// =============================================================================
// LLM Panel
// =============================================================================

class LLMPanel {
  constructor(client) {
    this.client = client
    this.traces = []
    this.elements = {
      list: document.getElementById('llm-list'),
      count: document.getElementById('llm-count'),
      statLlm: document.getElementById('stat-llm'),
    }
  }

  init() {
    this.client.on('llm', data => this.addTrace(data))
    this.client.on('connected', () => this.reset())
  }

  addTrace(trace) {
    this.traces.unshift(trace)
    if (this.traces.length > CONFIG.MAX_LLM_TRACES) {
      this.traces.pop()
    }

    this.elements.count.textContent = this.traces.length
    this.elements.statLlm.textContent = this.traces.length
    this.renderTrace(trace)
  }

  reset() {
    this.traces = []
    this.elements.list.innerHTML = ''
    this.elements.count.textContent = '0'
    this.elements.statLlm.textContent = '0'
  }

  renderTrace(trace) {
    const time = new Date(trace.timestamp).toLocaleTimeString()
    const tokens = trace.usage?.total_tokens || '?'
    const duration = Number.isFinite(trace.duration) ? `${trace.duration}ms` : 'n/a'

    const card = document.createElement('div')
    card.className = 'llm-card'

    // Messages HTML
    let messagesHtml = ''
    if (trace.messages && Array.isArray(trace.messages)) {
      messagesHtml = trace.messages.map(msg => `
        <div class="llm-message role-${msg.role || 'unknown'}">
          <div class="llm-message-role">${msg.role || 'unknown'}</div>
          <div class="llm-message-content">${escapeHtml(msg.content || '')}</div>
        </div>
      `).join('')
    }

    card.innerHTML = `
      <div class="llm-header">
        <div class="llm-title">
          <span class="llm-route">${escapeHtml(trace.route || 'unknown')}</span>
          <span style="color: var(--text-muted);">${time}</span>
        </div>
        <div class="llm-meta">
          <span>${tokens} tokens</span>
          <span>${duration}</span>
        </div>
      </div>
      <div class="llm-body">
        <div class="llm-section-title">Result</div>
        <div class="llm-content">${escapeHtml(trace.content || '')}</div>
        
        <div class="llm-section-title">Messages</div>
        <div class="llm-messages">
          ${messagesHtml || '<div class="empty-state">No messages</div>'}
        </div>
        
        <div class="llm-section-title">Usage</div>
        <div class="llm-content">${JSON.stringify(trace.usage || {}, null, 2)}</div>
      </div>
    `

    const header = card.querySelector('.llm-header')
    const body = card.querySelector('.llm-body')
    header.addEventListener('click', () => {
      body.classList.toggle('open')
    })

    this.elements.list.insertBefore(card, this.elements.list.firstChild)
  }
}

// =============================================================================
// Saliency Panel
// =============================================================================

class SaliencyPanel {
  constructor(client) {
    this.client = client
    this.data = null
    this.elements = {
      canvas: document.getElementById('saliency-canvas'),
      labels: document.getElementById('saliency-labels'),
      slot: document.getElementById('saliency-slot'),
    }
    this.ctx = this.elements.canvas.getContext('2d')
  }

  init() {
    this.client.on('saliency', data => this.update(data))
    this.client.on('connected', () => this.reset())
  }

  update(data) {
    this.data = data
    this.render()
  }

  reset() {
    this.data = null
    this.render()
  }

  render() {
    if (!this.data || !this.data.counters) {
      this.elements.labels.innerHTML = '<div class="empty-state">No data</div>'
      return
    }

    this.elements.slot.textContent = this.data.slot || 0

    // Use all counters directly from server (fixed order)
    const counters = this.data.counters

    // Render labels
    this.elements.labels.innerHTML = counters.map(c => `
      <div class="saliency-label">
        <span class="saliency-key">${escapeHtml(c.key || '')}</span>
        <span class="saliency-total">(${c.total || 0})</span>
      </div>
    `).join('')

    // Render canvas
    const cols = 100
    const rows = counters.length
    const cellW = 6
    const cellH = 16

    this.elements.canvas.width = cols * cellW
    this.elements.canvas.height = Math.max(1, rows) * cellH

    this.ctx.fillStyle = '#0d1117'
    this.ctx.fillRect(0, 0, this.elements.canvas.width, this.elements.canvas.height)

    let maxCell = 0
    for (const counter of counters) {
      for (let i = 0; i < Math.min(cols, counter.window?.length || 0); i++) {
        maxCell = Math.max(maxCell, counter.window[i] || 0)
      }
    }

    for (let y = 0; y < rows; y++) {
      const counter = counters[y]
      const w = counter.window || []
      const t = counter.triggers || []

      for (let x = 0; x < cols; x++) {
        const v = x < w.length ? (w[x] || 0) : 0
        const fired = x < t.length ? (t[x] || 0) : 0

        this.ctx.fillStyle = fired
          ? 'rgba(248, 81, 73, 0.9)'
          : this.colorFor(v, maxCell)
        this.ctx.fillRect(x * cellW, y * cellH, cellW - 1, cellH - 1)
      }
    }
  }

  colorFor(value, maxValue) {
    if (!maxValue)
      return 'rgba(0,0,0,0)'
    const t = Math.min(1, value / maxValue)
    const r = Math.round(88 + 80 * t)
    const g = Math.round(166 + 80 * t)
    const b = Math.round(255 * t)
    return `rgba(${r},${g},${b},${0.2 + 0.8 * t})`
  }
}

// =============================================================================
// Application
// =============================================================================

class DebugApp {
  constructor() {
    this.client = new DebugClient()
    this.panels = {
      queue: new QueuePanel(this.client),
      blackboard: new BlackboardPanel(this.client),
      logs: new LogsPanel(this.client),
      llm: new LLMPanel(this.client),
      saliency: new SaliencyPanel(this.client),
    }
    this.paused = false
  }

  init() {
    // Initialize all panels
    Object.values(this.panels).forEach(panel => panel.init())

    // Setup controls
    document.getElementById('clear-logs-btn').addEventListener('click', () => {
      this.panels.logs.clear()
    })

    document.getElementById('pause-btn').addEventListener('click', (e) => {
      this.paused = !this.paused
      this.panels.logs.setPaused(this.paused)
      e.target.textContent = this.paused ? 'Resume' : 'Pause'
    })

    document.getElementById('reconnect-btn').addEventListener('click', () => {
      this.client.reconnect()
    })

    // Connect
    this.client.connect()
  }
}

// =============================================================================
// Bootstrap
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const app = new DebugApp()
  app.init()
  window.debugApp = app // For debugging
})
