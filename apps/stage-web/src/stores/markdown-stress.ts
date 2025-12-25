import type { TraceEvent } from '@proj-airi/stage-shared'

import { defaultPerfTracer } from '@proj-airi/stage-shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'

interface RunSnapshot {
  startedAt: number
  stoppedAt: number
  events: TraceEvent[]
}

export const useMarkdownStressStore = defineStore('markdownStress', () => {
  const onlineMode = ref(false)
  const capturing = ref(false)
  const events = ref<TraceEvent[]>([])
  const lastRun = ref<RunSnapshot>()
  const mockPreview = ref<string>('')
  const scheduleDelayMs = ref(10000)

  let unsubscribe: (() => void) | undefined
  let startedAt = 0

  function startCapture() {
    if (capturing.value)
      return

    capturing.value = true
    startedAt = performance.now()
    events.value = []

    unsubscribe = defaultPerfTracer.subscribe((event) => {
      if (event.tracerId !== 'markdown')
        return

      events.value.push(event)
    })
    defaultPerfTracer.enable()
  }

  function stopCapture() {
    if (!capturing.value)
      return

    lastRun.value = {
      startedAt,
      stoppedAt: performance.now(),
      events: [...events.value],
    }

    unsubscribe?.()
    unsubscribe = undefined
    defaultPerfTracer.disable()
    capturing.value = false
  }

  function generateMockPreview() {
    mockPreview.value = [
      'User: 请写一个包含```python```和```typescript```的大代码块，插入一个GFM表格，还有一个$\\frac{1}{2}$数学块。',
      'Assistant(streamed): ```python\\nprint(\"hello world\")\\n``` ... <|EMOTE_HAPPY|> ...',
    ].join('\n')
  }

  function exportCsv(snapshot?: RunSnapshot) {
    const target = snapshot ?? lastRun.value
    if (!target)
      return

    const rows = [['tracerId', 'name', 'ts', 'duration', 'meta']]
    for (const event of target.events) {
      rows.push([
        event.tracerId,
        event.name,
        event.ts.toFixed(3),
        event.duration ?? '',
        JSON.stringify(event.meta ?? {}),
      ].map(field => `"${String(field).replace(/"/g, '""')}"`))
    }

    const csv = rows.map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `markdown-stress-${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return {
    onlineMode,
    capturing,
    events,
    lastRun,
    mockPreview,
    scheduleDelayMs,
    startCapture,
    stopCapture,
    generateMockPreview,
    exportCsv,
  }
})
