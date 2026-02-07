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
  MAX_REPL_RESULTS: 20,
  RECONNECT_MAX_ATTEMPTS: 10,
  RECONNECT_DELAY: 1000,
  PING_INTERVAL: 25000,
  UPDATE_THROTTLE: 100, // ms
}

const SYSTEM_STATE_MARKER = 'The following blackboard provides you with information about your current state:'

// =============================================================================
// Utility Functions
// =============================================================================

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function formatSystemMessageContent(content) {
  if (typeof content !== 'string')
    return content

  const idx = content.indexOf(SYSTEM_STATE_MARKER)
  if (idx === -1)
    return content

  return `===TRUNCATED===\n${content.slice(idx + SYSTEM_STATE_MARKER.length).trimStart()}`
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
// Reflex Panel
// =============================================================================

class ReflexPanel {
  constructor(client) {
    this.client = client
    this.state = null
    this.elements = {
      mode: document.getElementById('reflex-mode'),
      statMode: document.getElementById('stat-reflex-mode'),
      activeBehavior: document.getElementById('reflex-active-behavior'),
      signalType: document.getElementById('reflex-signal-type'),
      signalSource: document.getElementById('reflex-signal-source'),
      socialSpeaker: document.getElementById('reflex-social-speaker'),
    }
  }

  init() {
    this.client.on('reflex', data => this.update(data))
    this.client.on('connected', () => this.reset())
    this.render()
  }

  update(data) {
    this.state = data
    this.render()
  }

  reset() {
    this.state = null
    this.render()
  }

  render() {
    if (!this.state) {
      this.elements.mode.textContent = 'unknown'
      this.elements.mode.className = 'panel-badge'
      if (this.elements.statMode)
        this.elements.statMode.textContent = 'unknown'
      this.elements.activeBehavior.textContent = 'None'
      this.elements.signalType.textContent = 'None'
      this.elements.signalSource.textContent = '-'
      this.elements.socialSpeaker.textContent = 'None'
      return
    }

    const { mode, activeBehaviorId, context } = this.state

    // Mode
    this.elements.mode.textContent = mode
    this.elements.mode.className = `panel-badge ${mode === 'alert' ? 'badge-error' : (mode === 'social' ? 'badge-success' : '')}`
    if (this.elements.statMode)
      this.elements.statMode.textContent = mode

    // Behavior
    this.elements.activeBehavior.textContent = activeBehaviorId ? escapeHtml(activeBehaviorId) : 'None'

    // Attention
    if (context.attention?.lastSignalType) {
      this.elements.signalType.textContent = escapeHtml(context.attention.lastSignalType)
      this.elements.signalSource.textContent = escapeHtml(context.attention.lastSignalSourceId || '-')
    }
    else {
      this.elements.signalType.textContent = 'None'
    }

    // Social
    if (context.social?.lastSpeaker) {
      this.elements.socialSpeaker.textContent = escapeHtml(context.social.lastSpeaker)
    }
    else {
      this.elements.socialSpeaker.textContent = 'None'
    }
  }
}

// =============================================================================
// Brain Panel
// =============================================================================

class BrainPanel {
  constructor(client) {
    this.client = client
    this.state = null
    this.elements = {
      status: document.getElementById('brain-status'),
      queue: document.getElementById('brain-queue'),
      context: document.getElementById('brain-context'),
    }
  }

  init() {
    this.client.on('brain_state', data => this.update(data))
    this.client.on('connected', () => this.reset())
  }

  update(data) {
    this.state = data
    this.render()
  }

  reset() {
    this.state = null
    this.render()
  }

  render() {
    if (!this.state) {
      this.elements.status.textContent = 'Unknown'
      this.elements.queue.textContent = '-'
      this.elements.context.textContent = ''
      return
    }

    this.elements.status.textContent = this.state.status.toUpperCase()
    this.elements.status.className = `status-badge status-${this.state.status}`
    this.elements.queue.textContent = this.state.queueLength

    // Render context view (it's markdown/text)
    this.elements.context.textContent = this.state.lastContextView || '(No context yet)'
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
    this.currentFile = ''
    this.elements = {
      container: document.getElementById('logs-container'),
      search: document.getElementById('log-search'),
      levelFilter: document.getElementById('log-level-filter'),
      autoScroll: document.getElementById('auto-scroll'),
      fileSelect: document.getElementById('log-file-select'),
      loadFile: document.getElementById('load-log-file'),
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

    this.elements.loadFile.addEventListener('click', () => {
      const file = this.elements.fileSelect.value
      if (!file) {
        this.currentFile = ''
        this.reset()
        return
      }
      this.loadPersistedLog(file)
    })

    this.refreshFileList()

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

  async refreshFileList() {
    try {
      const res = await fetch('/api/logs')
      const json = await res.json()
      const files = json.files || []
      const select = this.elements.fileSelect
      if (!select)
        return
      const current = select.value
      select.innerHTML = `<option value="">Live (current session)</option>${files.map(f => `<option value="${f}">${f}</option>`).join('')}`
      if (files.includes(current))
        select.value = current
    }
    catch (err) {
      console.error('Failed to load log files', err)
    }
  }

  async loadPersistedLog(file) {
    try {
      const res = await fetch(`/api/logs?file=${encodeURIComponent(file)}&limit=1000`)
      if (!res.ok) {
        console.error('Failed to fetch log file', await res.text())
        return
      }
      const json = await res.json()
      const events = Array.isArray(json.events) ? json.events : []
      const logEntries = events
        .filter(e => e.type === 'log')
        .map(e => e.payload)
        .filter(Boolean)
      this.logs = logEntries
      this.currentFile = file
      this.elements.statEvents.textContent = this.logs.length
      this.render()
    }
    catch (err) {
      console.error('Failed to load persisted log', err)
    }
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
// Conversation Panel (Live Chat View)
// =============================================================================

class ConversationPanel {
  constructor(client) {
    this.client = client
    // Each session: { messages: Message[], greyed: boolean }
    this.sessions = [{ messages: [], greyed: false }]
    this.isProcessing = false
    this.autoScroll = true
    this.elements = {
      container: document.getElementById('conversation-container'),
      count: document.getElementById('conversation-count'),
      statLlm: document.getElementById('stat-llm'),
      processingBadge: document.getElementById('conversation-processing'),
      scroll: document.getElementById('conversation-container')?.closest('.panel-content') || document.getElementById('conversation-container'),
    }
  }

  init() {
    this.client.on('conversation_update', data => this.handleUpdate(data))
    this.client.on('connected', () => {
      this.reset()
      this.client.send({ type: 'request_conversation' })
    })
    this.render()
  }

  handleUpdate(data) {
    if (data.sessionBoundary) {
      // Grey out current session and start a new one
      const currentSession = this.sessions[this.sessions.length - 1]
      if (currentSession) {
        currentSession.greyed = true
      }
      this.sessions.push({ messages: [], greyed: false })
    }
    else {
      // Update current session messages
      const currentSession = this.sessions[this.sessions.length - 1]
      if (currentSession) {
        currentSession.messages = data.messages || []
      }
    }

    this.isProcessing = !!data.isProcessing
    this.updateStats()
    this.render()
  }

  reset() {
    this.sessions = [{ messages: [], greyed: false }]
    this.isProcessing = false
    this.updateStats()
    this.render()
  }

  updateStats() {
    const totalMessages = this.sessions.reduce((sum, s) => sum + s.messages.length, 0)
    if (this.elements.count)
      this.elements.count.textContent = totalMessages
    if (this.elements.statLlm)
      this.elements.statLlm.textContent = totalMessages
    if (this.elements.processingBadge)
      this.elements.processingBadge.classList.toggle('hidden', !this.isProcessing)
  }

  render() {
    if (!this.elements.container)
      return

    const html = this.sessions.map((session, sessionIdx) => {
      const sessionClass = session.greyed ? 'chat-session chat-session-greyed' : 'chat-session'
      const messagesHtml = this.renderSessionMessages(session.messages)
      const dividerHtml = session.greyed
        ? '<div class="chat-session-divider"><span>Session cleared</span></div>'
        : ''

      return `<div class="${sessionClass}">${messagesHtml}</div>${dividerHtml}`
    }).join('')

    const typingHtml = this.isProcessing
      ? `<div class="chat-typing-indicator">
           <span class="chat-typing-dot"></span>
           <span class="chat-typing-dot"></span>
           <span class="chat-typing-dot"></span>
         </div>`
      : ''

    this.elements.container.innerHTML = html + typingHtml

    // Attach toggle handlers for system messages
    this.elements.container.querySelectorAll('.chat-system-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const body = btn.closest('.chat-message-system')?.querySelector('.chat-system-body')
        if (body) {
          body.classList.toggle('open')
          btn.textContent = body.classList.contains('open') ? '▼ System Prompt' : '▶ System Prompt'
        }
      })
    })

    if (this.autoScroll) {
      const scrollEl = this.elements.scroll
      if (scrollEl) {
        requestAnimationFrame(() => {
          scrollEl.scrollTop = scrollEl.scrollHeight
        })
      }
    }
  }

  renderSessionMessages(messages) {
    if (!messages || messages.length === 0) {
      return '<div class="empty-state">No messages yet</div>'
    }

    return messages.map((msg) => {
      const role = msg.role || 'unknown'

      if (role === 'system') {
        return this.renderSystemMessage(msg)
      }

      if (role === 'user') {
        return this.renderUserMessage(msg)
      }

      if (role === 'assistant') {
        return this.renderAssistantMessage(msg)
      }

      return `<div class="chat-message chat-message-unknown">
        <div class="chat-role">${escapeHtml(role)}</div>
        <div class="chat-bubble chat-bubble-unknown">${escapeHtml(msg.content || '')}</div>
      </div>`
    }).join('')
  }

  renderSystemMessage(msg) {
    const preview = formatSystemMessageContent(msg.content || '')
    return `<div class="chat-message chat-message-system">
      <button class="chat-system-toggle">▶ System Prompt</button>
      <div class="chat-system-body">
        <div class="chat-bubble chat-bubble-system">${escapeHtml(preview)}</div>
      </div>
    </div>`
  }

  renderUserMessage(msg) {
    return `<div class="chat-message chat-message-user">
      <div class="chat-role">user</div>
      <div class="chat-bubble chat-bubble-user">${escapeHtml(msg.content || '')}</div>
    </div>`
  }

  renderAssistantMessage(msg) {
    const reasoningHtml = msg.reasoning
      ? `<div class="chat-reasoning">${escapeHtml(msg.reasoning)}</div>`
      : ''
    return `<div class="chat-message chat-message-assistant">
      <div class="chat-role">assistant</div>
      ${reasoningHtml}
      <div class="chat-bubble chat-bubble-assistant">${escapeHtml(msg.content || '')}</div>
    </div>`
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
    // Always show a subtle color for empty cells, never fully transparent
    if (value === 0) {
      return 'rgba(30, 38, 50, 1)' // Dark background for empty cells
    }
    // Normalize value when we have data
    const max = maxValue || 1
    const t = Math.min(1, value / max)
    const r = Math.round(88 + 80 * t)
    const g = Math.round(166 + 80 * t)
    const b = Math.round(255 * t)
    return `rgba(${r},${g},${b},${0.3 + 0.7 * t})`
  }
}

// =============================================================================
// Tools Panel
// =============================================================================

class ToolsPanel {
  constructor(client) {
    this.client = client
    this.tools = []
    this.filter = ''
    this.executingTools = new Set()
    this.elements = {
      grid: document.getElementById('tools-grid'),
      search: document.getElementById('tools-search'),
    }
  }

  init() {
    this.client.on('debug:tools_list', data => this.updateTools(data))
    this.client.on('debug:tool_result', data => this.handleResult(data))
    this.client.on('connected', () => this.requestTools())

    this.elements.search?.addEventListener('input', (e) => {
      this.filter = e.target.value.toLowerCase()
      this.render()
    })
  }

  requestTools() {
    console.log('[ToolsPanel] Requesting tools...')
    // Check if we already have tools to avoid re-rendering on reconnect if not needed
    // But re-requesting ensures we are in sync with server capabilities
    this.client.send({ type: 'request_tools' })
  }

  updateTools(data) {
    if (data && data.tools) {
      this.tools = data.tools
      this.render()
    }
  }

  render() {
    if (!this.tools || this.tools.length === 0) {
      this.elements.grid.innerHTML = '<div class="empty-state">Loading tools...</div>'
      return
    }

    const filtered = this.tools.filter((tool) => {
      if (!this.filter)
        return true
      return tool.name.toLowerCase().includes(this.filter)
        || (tool.description && tool.description.toLowerCase().includes(this.filter))
    })

    if (filtered.length === 0) {
      this.elements.grid.innerHTML = '<div class="empty-state">No tools match filter</div>'
      return
    }

    // Don't nuke usage of existing DOM elements if possible to preserve form state?
    // For simplicity, re-render is fine for this debug tool.

    this.elements.grid.innerHTML = filtered.map(tool => this.renderCard(tool)).join('')

    // Attach event listeners
    filtered.forEach((tool) => {
      const card = document.getElementById(`tool-card-${tool.name}`)
      const executeBtn = card?.querySelector('.btn-execute')

      executeBtn?.addEventListener('click', () => this.executeTool(tool))
    })
  }

  renderCard(tool) {
    const isExecuting = this.executingTools.has(tool.name)
    const cardState = isExecuting ? 'executing' : ''
    const paramCount = tool.params.length

    return `
      <div id="tool-card-${tool.name}" class="tool-card ${cardState}">
        <div class="tool-card-header">
          <span class="tool-name">${escapeHtml(tool.name)}</span>
          ${paramCount > 0 ? `<span class="tool-badge">${paramCount} param${paramCount > 1 ? 's' : ''}</span>` : ''}
        </div>
        <div class="tool-description">${escapeHtml(tool.description || '')}</div>
        ${this.renderParams(tool)}
        <div class="tool-actions">
          <button class="btn-execute" ${isExecuting ? 'disabled' : ''}>
            ${isExecuting ? 'Executing...' : 'Execute'}
          </button>
        </div>
        <div id="result-${tool.name}" class="tool-result hidden"></div>
      </div>
    `
  }

  renderParams(tool) {
    if (tool.params.length === 0)
      return ''

    return `
      <div class="tool-params">
        ${tool.params.map(param => `
          <div class="param-group">
            <label class="param-label">${escapeHtml(param.name)} (${param.type})</label>
            <input
              type="${param.type === 'number' ? 'number' : 'text'}"
              class="param-input"
              data-param="${param.name}"
              ${param.min !== undefined ? `min="${param.min}"` : ''}
              ${param.max !== undefined ? `max="${param.max}"` : ''}
              ${param.default !== undefined ? `value="${param.default}"` : ''}
              placeholder="${escapeHtml(param.description || '')}"
            />
          </div>
        `).join('')}
      </div>
    `
  }

  executeTool(tool) {
    const card = document.getElementById(`tool-card-${tool.name}`)
    if (!card)
      return

    // Collect parameter values
    const params = {}
    const inputs = card.querySelectorAll('.param-input')

    for (const input of inputs) {
      const paramName = input.dataset.param
      let value = input.value

      // Convert to appropriate type based on definition
      const paramDef = tool.params.find(p => p.name === paramName)
      if (paramDef) {
        if (paramDef.type === 'number') {
          if (value === '') {
            // Handle empty number input if needed?
          }
          else {
            value = Number.parseFloat(value)
            if (isNaN(value)) {
              this.showResult(tool.name, { error: `Invalid number for ${paramName}` }, true)
              return
            }
          }
        }
      }

      // Simple type conversion could be improved but sufficient for now
      params[paramName] = value
    }

    // Mark as executing
    this.executingTools.add(tool.name)
    this.updateCardState(tool.name, 'executing')
    this.hideResult(tool.name)

    // Send command to server
    this.client.send({
      type: 'execute_tool',
      payload: {
        toolName: tool.name,
        params,
      },
    })
  }

  handleResult(data) {
    const { toolName, result, error } = data

    this.executingTools.delete(toolName)
    this.updateCardState(toolName, error ? 'error' : 'success')
    this.showResult(toolName, data, !!error)

    if (!error) {
      setTimeout(() => {
        // Reset state visual but keep result visible for a bit?
        // Or remove success styling
        const card = document.getElementById(`tool-card-${toolName}`)
        if (card) {
          card.classList.remove('success')
          // Don't auto-hide result immediately, maybe user wants to read it
        }
      }, 3000)
    }
  }

  updateCardState(toolName, state) {
    const card = document.getElementById(`tool-card-${toolName}`)
    if (!card)
      return

    card.classList.remove('executing', 'success', 'error')
    if (state)
      card.classList.add(state)

    const btn = card.querySelector('.btn-execute')
    if (btn) {
      if (state === 'executing') {
        btn.disabled = true
        btn.textContent = 'Executing...'
      }
      else {
        btn.disabled = false
        btn.textContent = 'Execute'
      }
    }
  }

  showResult(toolName, data, isError) {
    const resultEl = document.getElementById(`result-${toolName}`)
    if (!resultEl)
      return

    resultEl.classList.remove('hidden')

    const label = isError ? 'Error' : 'Result'
    const content = isError ? data.error : data.result

    resultEl.innerHTML = `
      <span class="result-label">${label}</span>
      <div class="result-content">${escapeHtml(content || 'No result')}</div>
    `
  }

  hideResult(toolName) {
    const resultEl = document.getElementById(`result-${toolName}`)
    if (resultEl) {
      resultEl.classList.add('hidden')
    }
  }
}

class ReplPanel {
  constructor(client) {
    this.client = client
    this.variables = []
    this.variableFilter = ''
    this.results = []
    this.isRunning = false
    this.elements = {
      varsList: document.getElementById('repl-vars-list'),
      varsSearch: document.getElementById('repl-vars-search'),
      refreshBtn: document.getElementById('repl-refresh-state'),
      runBtn: document.getElementById('repl-run-btn'),
      codeInput: document.getElementById('repl-code-input'),
      resultList: document.getElementById('repl-result-list'),
    }
  }

  init() {
    this.client.on('debug:repl_state', data => this.updateState(data))
    this.client.on('debug:repl_result', data => this.handleResult(data))
    this.client.on('connected', () => this.requestState())

    this.elements.refreshBtn?.addEventListener('click', () => this.requestState())
    this.elements.varsSearch?.addEventListener('input', (event) => {
      this.variableFilter = (event.target?.value || '').toLowerCase()
      this.renderVariables()
    })
    this.elements.runBtn?.addEventListener('click', () => this.execute())
    this.elements.codeInput?.addEventListener('keydown', (event) => {
      const isEnter = event.key === 'Enter'
      const hasModifier = event.metaKey || event.ctrlKey
      if (!isEnter || !hasModifier)
        return

      event.preventDefault()
      this.execute()
    })

    this.renderVariables()
    this.renderResults()
  }

  requestState() {
    this.client.send({ type: 'request_repl_state' })
  }

  execute() {
    const code = this.elements.codeInput?.value ?? ''
    if (!code.trim()) {
      this.results.unshift({
        source: 'manual',
        code: '',
        logs: [],
        actions: [],
        error: 'Code is empty',
        durationMs: 0,
        timestamp: Date.now(),
      })
      this.results = this.results.slice(0, CONFIG.MAX_REPL_RESULTS)
      this.renderResults()
      return
    }

    this.isRunning = true
    this.renderRunState()

    this.client.send({
      type: 'execute_repl',
      payload: { code },
    })
  }

  updateState(data) {
    if (!data || !Array.isArray(data.variables))
      return
    this.variables = data.variables
    this.renderVariables()
  }

  handleResult(data) {
    this.isRunning = false
    this.renderRunState()

    this.results.unshift(data)
    if (this.results.length > CONFIG.MAX_REPL_RESULTS) {
      this.results = this.results.slice(0, CONFIG.MAX_REPL_RESULTS)
    }
    this.renderResults()
  }

  renderRunState() {
    if (!this.elements.runBtn)
      return

    this.elements.runBtn.disabled = this.isRunning
    this.elements.runBtn.textContent = this.isRunning ? 'Running...' : 'Run (Ctrl/Cmd+Enter)'
  }

  renderVariables() {
    if (!this.elements.varsList)
      return

    if (this.variables.length === 0) {
      this.elements.varsList.innerHTML = '<div class="empty-state">No variables loaded</div>'
      return
    }

    const filtered = this.variables.filter((variable) => {
      if (!this.variableFilter)
        return true
      const searchSpace = `${variable.name} ${variable.kind} ${variable.preview} ${variable.readonly ? 'readonly' : 'writable'}`.toLowerCase()
      return searchSpace.includes(this.variableFilter)
    })

    if (filtered.length === 0) {
      this.elements.varsList.innerHTML = '<div class="empty-state">No variables match filter</div>'
      return
    }

    this.elements.varsList.innerHTML = filtered.map(v => `
      <div class="repl-var-row">
        <div class="repl-var-name">${escapeHtml(v.name)}</div>
        <div class="repl-var-meta">${escapeHtml(v.kind)} · ${v.readonly ? 'readonly' : 'writable'}</div>
        <div class="repl-var-preview">${escapeHtml(v.preview || '')}</div>
      </div>
    `).join('')
  }

  renderResults() {
    if (!this.elements.resultList)
      return

    if (this.results.length === 0) {
      this.elements.resultList.innerHTML = '<div class="empty-state">No REPL executions yet</div>'
      return
    }

    this.elements.resultList.innerHTML = this.results.map((result) => {
      const isError = !!result.error
      const source = result.source === 'llm' ? 'llm' : 'manual'
      const sourceLabel = source === 'llm' ? 'LLM' : 'MANUAL'
      const actionSummary = Array.isArray(result.actions) && result.actions.length > 0
        ? result.actions.map((action) => {
            const status = action.ok ? 'ok' : 'error'
            return `${status} ${action.tool}(${JSON.stringify(action.params || {})})${action.error ? ` -> ${action.error}` : ''}${action.result ? ` -> ${action.result}` : ''}`
          }).join('\n')
        : '(none)'
      const logsSummary = Array.isArray(result.logs) && result.logs.length > 0
        ? result.logs.join('\n')
        : '(none)'
      const returnValue = typeof result.returnValue === 'string' ? result.returnValue : '(undefined)'
      const time = new Date(result.timestamp || Date.now()).toLocaleTimeString()

      return `
        <div class="repl-result-card source-${source} ${isError ? 'error' : ''}">
          <div class="repl-result-meta">
            <span>${time} · ${sourceLabel}</span>
            <span>${Number.isFinite(result.durationMs) ? `${result.durationMs}ms` : '-'}</span>
          </div>
          <div class="repl-result-section">
            <div class="repl-result-label">Code</div>
            <div class="repl-result-content">${escapeHtml(result.code || '')}</div>
          </div>
          <div class="repl-result-section">
            <div class="repl-result-label">Return</div>
            <div class="repl-result-content">${escapeHtml(returnValue)}</div>
          </div>
          <div class="repl-result-section">
            <div class="repl-result-label">Actions</div>
            <div class="repl-result-content">${escapeHtml(actionSummary)}</div>
          </div>
          <div class="repl-result-section">
            <div class="repl-result-label">Logs</div>
            <div class="repl-result-content">${escapeHtml(logsSummary)}</div>
          </div>
          ${isError
            ? `
            <div class="repl-result-section">
              <div class="repl-result-label">Error</div>
              <div class="repl-result-content">${escapeHtml(result.error)}</div>
            </div>
          `
            : ''}
        </div>
      `
    }).join('')
  }
}

class TimelinePanel {
  constructor(client) {
    this.client = client
    this.events = []
    this.filter = { type: 'all', search: '' }
    this.selectedTraceId = null
    this.elements = {
      list: document.getElementById('timeline-list'),
      container: document.getElementById('timeline-container'),
      search: document.getElementById('timeline-search'),
      typeFilter: document.getElementById('timeline-type-filter'),
      clearBtn: document.getElementById('timeline-clear-btn'),
      detail: document.getElementById('trace-detail'),
      detailTitle: document.getElementById('trace-detail-title'),
      detailContent: document.getElementById('trace-detail-content'),
      detailClose: document.getElementById('trace-detail-close'),
    }
  }

  init() {
    this.client.on('trace', data => this.addEvent(data))
    this.client.on('trace_batch', (data) => {
      if (data.events) {
        data.events.forEach(e => this.addEvent(e))
      }
    })
    this.client.on('connected', () => this.reset())

    this.elements.search?.addEventListener('input', (e) => {
      this.filter.search = e.target.value.toLowerCase()
      this.renderThrottled()
    })

    this.elements.typeFilter?.addEventListener('change', (e) => {
      this.filter.type = e.target.value
      this.renderThrottled()
    })

    this.elements.clearBtn?.addEventListener('click', () => this.clear())
    this.elements.detailClose?.addEventListener('click', () => this.hideDetail())

    this.renderThrottled = throttle(() => this.render(), CONFIG.UPDATE_THROTTLE)
  }

  addEvent(event) {
    this.events.push(event)
    if (this.events.length > 1000) {
      this.events.shift()
    }
    this.renderThrottled()
  }

  reset() {
    this.events = []
    this.selectedTraceId = null
    this.hideDetail()
    this.render()
  }

  clear() {
    this.reset()
  }

  render() {
    const filtered = this.events.filter(e => this.matchesFilter(e))
    const recent = filtered.slice(-200) // Show last 200

    if (recent.length === 0) {
      this.elements.list.innerHTML = '<div class="empty-state">No events</div>'
      return
    }

    this.elements.list.innerHTML = recent.map(e => this.renderEvent(e)).join('')

    // Attach click handlers
    this.elements.list.querySelectorAll('.timeline-event').forEach((el) => {
      el.addEventListener('click', () => {
        const traceId = el.dataset.traceId
        this.showTraceDetail(traceId)
      })
    })

    // Auto-scroll
    this.elements.container.scrollTop = this.elements.container.scrollHeight
  }

  matchesFilter(event) {
    if (this.filter.type !== 'all' && !event.type.startsWith(this.filter.type)) {
      return false
    }
    if (this.filter.search) {
      const searchStr = `${event.type} ${JSON.stringify(event.payload)}`.toLowerCase()
      if (!searchStr.includes(this.filter.search)) {
        return false
      }
    }
    return true
  }

  renderEvent(event) {
    const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    })

    const isSignal = event.type.startsWith('signal:')
    const isRaw = event.type.startsWith('raw:')
    const typeClass = isSignal ? 'type-signal' : (isRaw ? 'type-raw' : 'type-other')

    // Extract useful info from payload
    let info = ''
    if (event.payload) {
      const p = event.payload
      if (p.description)
        info = p.description
      else if (p.displayName)
        info = p.displayName
      else if (p.entityType)
        info = p.entityType
    }

    const hasParent = event.parentId ? 'has-parent' : ''

    return `
            <div class="timeline-event ${typeClass} ${hasParent}"
                 data-trace-id="${event.traceId}"
                 data-event-id="${event.id}">
                <span class="timeline-time">${time}</span>
                <span class="timeline-type">${escapeHtml(event.type)}</span>
                ${info ? `<span class="timeline-info">${escapeHtml(info)}</span>` : ''}
                <span class="timeline-trace" title="Trace: ${event.traceId}">⎘</span>
            </div>
        `
  }

  showTraceDetail(traceId) {
    this.selectedTraceId = traceId
    const traceEvents = this.events.filter(e => e.traceId === traceId)

    if (traceEvents.length === 0) {
      return
    }

    // Build event tree
    const tree = this.buildEventTree(traceEvents)

    this.elements.detailTitle.textContent = `Trace: ${traceId.slice(0, 8)}...`
    this.elements.detailContent.innerHTML = this.renderEventTree(tree)
    this.elements.detail.classList.remove('hidden')

    // Highlight in main list
    this.elements.list.querySelectorAll('.timeline-event').forEach((el) => {
      el.classList.toggle('selected', el.dataset.traceId === traceId)
    })
  }

  hideDetail() {
    this.elements.detail?.classList.add('hidden')
    this.selectedTraceId = null
    this.elements.list?.querySelectorAll('.timeline-event.selected').forEach((el) => {
      el.classList.remove('selected')
    })
  }

  buildEventTree(events) {
    const eventMap = new Map()
    const roots = []

    // Index all events
    events.forEach(e => eventMap.set(e.id, { event: e, children: [] }))

    // Build tree
    events.forEach((e) => {
      const node = eventMap.get(e.id)
      if (e.parentId && eventMap.has(e.parentId)) {
        eventMap.get(e.parentId).children.push(node)
      }
      else {
        roots.push(node)
      }
    })

    return roots
  }

  renderEventTree(nodes, depth = 0) {
    return nodes.map((node) => {
      const e = node.event
      const indent = depth * 16
      const time = new Date(e.timestamp).toLocaleTimeString('en-US', { hour12: false })

      return `
                <div class="trace-tree-node" style="padding-left: ${indent}px">
                    <div class="trace-node-header">
                        ${depth > 0 ? '<span class="trace-connector">↳</span>' : ''}
                        <span class="trace-node-type">${escapeHtml(e.type)}</span>
                        <span class="trace-node-time">${time}</span>
                    </div>
                    <div class="trace-node-payload">${escapeHtml(JSON.stringify(e.payload, null, 2))}</div>
                    ${node.children.length > 0 ? this.renderEventTree(node.children, depth + 1) : ''}
                </div>
            `
    }).join('')
  }
}

// =============================================================================
// Application
// =============================================================================

// =============================================================================
// Layout Manager (Resizing & Maximizing)
// =============================================================================

class LayoutManager {
  constructor() {
    this.root = document.documentElement
    this.activeSplitter = null
    this.startPos = 0
    this.startSize = 0
  }

  init() {
    this.setupSplitters()
    this.setupMaximizeButtons()
  }

  setupSplitters() {
    const splitters = [
      { id: 'splitter-v1', var: '--col-left', type: 'v' },
      { id: 'splitter-h1', var: '--row-1', type: 'h' },
      { id: 'splitter-h2', var: '--row-2', type: 'h' },
      { id: 'splitter-h3', var: '--row-3', type: 'h' },
    ]

    splitters.forEach((config) => {
      const el = document.getElementById(config.id)
      if (!el)
        return

      el.addEventListener('mousedown', (e) => {
        this.activeSplitter = { el, ...config }
        this.startPos = config.type === 'v' ? e.clientX : e.clientY

        const style = getComputedStyle(this.root)
        const raw = style.getPropertyValue(config.var)
        const parsed = Number.parseFloat(raw)

        const fallbackSize = () => {
          if (config.var === '--col-left')
            return document.getElementById('left-column')?.getBoundingClientRect().width
          if (config.var === '--row-1')
            return document.getElementById('logs-section')?.getBoundingClientRect().height
          if (config.var === '--row-2')
            return document.getElementById('timeline-section')?.getBoundingClientRect().height
          if (config.var === '--row-3')
            return document.getElementById('conversation-section')?.getBoundingClientRect().height
          return undefined
        }

        this.startSize = Number.isFinite(parsed) ? parsed : (fallbackSize() || 200)

        el.classList.add('dragging')
        document.body.style.cursor = config.type === 'v' ? 'col-resize' : 'row-resize'
        document.body.style.userSelect = 'none' // Prevent text selection
      })
    })

    document.addEventListener('mousemove', e => this.handleDrag(e))
    document.addEventListener('mouseup', () => this.handleDragEnd())
  }

  handleDrag(e) {
    if (!this.activeSplitter)
      return

    const currentPos = this.activeSplitter.type === 'v' ? e.clientX : e.clientY
    const delta = currentPos - this.startPos
    const newSize = Math.max(50, this.startSize + delta) // Min 50px

    this.root.style.setProperty(this.activeSplitter.var, `${newSize}px`)
  }

  handleDragEnd() {
    if (!this.activeSplitter)
      return

    this.activeSplitter.el.classList.remove('dragging')
    this.activeSplitter = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  setupMaximizeButtons() {
    document.querySelectorAll('.maximize-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation() // Prevent bubbling
        const panel = btn.closest('.panel')
        if (!panel)
          return

        panel.classList.toggle('maximized')
        const isMaximized = panel.classList.contains('maximized')
        btn.textContent = isMaximized ? '✕' : '⤢'
        btn.title = isMaximized ? 'Restore' : 'Maximize'
      })
    })
  }
}

class DebugApp {
  constructor() {
    this.client = new DebugClient()
    this.layoutManager = new LayoutManager()
    this.queuePanel = new QueuePanel(this.client)
    this.reflexPanel = new ReflexPanel(this.client)
    this.brainPanel = new BrainPanel(this.client)
    this.logsPanel = new LogsPanel(this.client)
    this.conversationPanel = new ConversationPanel(this.client)
    this.saliencyPanel = new SaliencyPanel(this.client)
    this.timelinePanel = new TimelinePanel(this.client)
    this.toolsPanel = new ToolsPanel(this.client)
    this.replPanel = new ReplPanel(this.client)

    this.panels = {
      queue: this.queuePanel,
      reflex: this.reflexPanel,
      brain: this.brainPanel,
      logs: this.logsPanel,
      conversation: this.conversationPanel,
      saliency: this.saliencyPanel,
      timeline: this.timelinePanel,
      tools: this.toolsPanel,
      repl: this.replPanel,
    }
    this.paused = false
  }

  init() {
    // Initialize layout
    this.layoutManager.init()

    // Tabs
    this.setupTabs()

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

  setupTabs() {
    const tabs = Array.from(document.querySelectorAll('.tab-button'))
    const views = Array.from(document.querySelectorAll('.view'))

    const activate = (target) => {
      tabs.forEach(btn => btn.classList.toggle('active', btn.dataset.target === target))
      views.forEach(view => view.classList.toggle('active', view.id === target))
    }

    tabs.forEach((btn) => {
      btn.addEventListener('click', () => activate(btn.dataset.target))
    })

    // Default
    activate('main-view')
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
