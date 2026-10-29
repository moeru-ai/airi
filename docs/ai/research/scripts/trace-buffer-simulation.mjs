// Buffer simulation for docs/ai/adr/2026-10-22-agent-trace-event-stream.md.
// It generates a 30 minute voice session and compares buffer policies.
// Run: node docs/ai/research/scripts/trace-buffer-simulation.mjs

import process from 'node:process'

const SESSION_S = 30 * 60

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const sources = { 'window:main': 0, 'window:chat': 0, 'main': 0, 'worker:vad': 0, 'plugin:minecraft': 0 }
function rec(source, type, t, track, extra = {}) {
  sources[source] = (sources[source] ?? 0) + 1
  return { source, epoch: 'e1', seq: sources[source], ts: t * 1000, clock: `mono:${source}`, track, type, ...extra }
}

/**
 * @param {object} opts
 * @param {number} opts.participants number of participants (1 user + N-1 agents)
 * @param {number} opts.turnEveryS mean seconds between exchanges
 * @param {boolean} opts.seriesOn whether a viewer wants the series (VAD 20 Hz per participant, LLM chunk rate 10 Hz)
 * @param {boolean} opts.chunked series as 1 s chunks instead of one record per point
 * @param {number} [opts.seed] seed of the random generator
 */
function generate({ participants, turnEveryS, seriesOn, chunked, seed = 1 }) {
  const r = rng(seed)
  const out = []
  const actors = Array.from({ length: participants }, (_, i) => (i === 0 ? 'u_1' : `a_${i}`))
  let turn = 0
  let t = 2
  // turns
  while (t < SESSION_S - 20) {
    turn++
    const ids = { turn: `t_${turn}`, conversation: 'c_1' }
    const speaker = actors[0]
    const responder = actors[1 + Math.floor(r() * (participants - 1))]
    // user speech: 2 segments
    let ct = t
    for (let k = 0; k < 2; k++) {
      const sid = `sp_${turn}_${k}`
      const dur = 1 + r() * 2.5
      out.push(rec('worker:vad', 'span.begin', ct, `participants/${speaker}/speech`, { spanId: sid, name: 'speech', ids }))
      out.push(rec('worker:vad', 'span.end', ct + dur, `participants/${speaker}/speech`, { spanId: sid, status: 'ok', ids, attrs: { 'vad.stop_frame': 123456, 'vad.hangover_ms': 300 } }))
      // asr partials
      const partials = 4 + Math.floor(r() * 6)
      for (let p = 0; p < partials; p++)
        out.push(rec('window:main', 'instant', ct + (dur * (p + 1)) / (partials + 1), `participants/${speaker}/asr`, { name: 'transcript.partial', ids, attrs: { 'asr.content.text': 'hello this is a partial transcript of some length' } }))
      ct += dur + 0.3
    }
    out.push(rec('window:main', 'instant', ct, `participants/${speaker}/asr`, { name: 'transcript.final', ids, attrs: { 'asr.content.text': 'hello this is the final transcript of the user turn', 'asr.words_list': Array.from({ length: 30 }, (_, i) => i * 100) } }))
    for (let e = 0; e < 3; e++)
      out.push(rec('window:main', 'instant', ct + 0.1 * e, 'conversations/c_1/endpoint', { name: 'endpoint.decided', ids, attrs: { 'decision.p': 0.7, 'decision.threshold': 0.5, 'decision.verdict': e === 2 ? 'end' : 'hold', 'decision.reason': 'semantic' } }))
    out.push(rec('window:main', 'instant', ct + 0.3, 'conversations/c_1/endpoint', { name: 'turn.ended', ids }))
    ct += 0.3
    // state changes
    for (const a of [speaker, responder])
      out.push(rec('window:main', 'state', ct, `participants/${a}/state`, { value: 'thinking', from: 'listening', ids }))
    // LLM
    const llmDur = 1.5 + r() * 3
    out.push(rec('window:chat', 'span.begin', ct, `participants/${responder}/llm`, { spanId: `llm_${turn}`, name: 'llm.request', ids, attrs: { 'gen_ai.request.model': 'model-x', 'gen_ai.provider.name': 'openai' } }))
    out.push(rec('window:chat', 'span.begin', ct, `participants/${responder}/llm`, { spanId: `llmA_${turn}`, parentSpanId: `llm_${turn}`, name: 'llm.attempt', ids }))
    out.push(rec('window:chat', 'instant', ct + 0.4, `participants/${responder}/llm`, { name: 'llm.first_chunk', spanId: `llm_${turn}`, ids }))
    out.push(rec('window:chat', 'instant', ct + 0.5, `participants/${responder}/llm`, { name: 'llm.first_answer', spanId: `llm_${turn}`, ids }))
    if (seriesOn) {
      if (chunked) {
        for (let c = 0; c < Math.ceil(llmDur); c++)
          out.push(rec('window:chat', 'sample.chunk', ct + c, `participants/${responder}/llm/chunks`, { intervalMs: 100, values: { tokens: Array.from({ length: 10 }, () => Math.floor(r() * 8)) } }))
      }
      else {
        for (let c = 0; c < llmDur * 10; c++)
          out.push(rec('window:chat', 'sample', ct + c / 10, `participants/${responder}/llm/chunks`, { values: { tokens: Math.floor(r() * 8) } }))
      }
    }
    out.push(rec('window:chat', 'span.end', ct + llmDur, `participants/${responder}/llm`, { spanId: `llmA_${turn}`, status: 'ok', ids }))
    out.push(rec('window:chat', 'span.end', ct + llmDur, `participants/${responder}/llm`, { spanId: `llm_${turn}`, status: 'ok', ids, attrs: { 'gen_ai.usage.input_tokens': 2400, 'gen_ai.usage.output_tokens': 180, 'llm.ttft_ms': 400 } }))
    // streaming control
    out.push(rec('window:chat', 'span.begin', ct + 0.6, `participants/${responder}/control`, { spanId: `sc_${turn}`, name: 'control.dispatch', ids }))
    out.push(rec('window:chat', 'span.end', ct + 0.61, `participants/${responder}/control`, { spanId: `sc_${turn}`, status: 'ok', ids }))
    // tool call sometimes
    if (r() < 0.2) {
      out.push(rec('window:chat', 'span.begin', ct + 0.7, `participants/${responder}/tools`, { spanId: `tool_${turn}`, name: 'tool.call', ids: { ...ids, toolCall: `tc_${turn}` }, attrs: { 'gen_ai.tool.name': 'search' } }))
      out.push(rec('window:chat', 'span.end', ct + 1.7, `participants/${responder}/tools`, { spanId: `tool_${turn}`, status: 'ok', ids }))
    }
    // TTS + playback: 3 segments
    let pt = ct + 0.8
    out.push(rec('window:main', 'state', pt, `participants/${responder}/state`, { value: 'speaking', from: 'thinking', ids }))
    out.push(rec('window:main', 'instant', pt, 'conversations/c_1/floor', { name: 'floor.taken', ids, attrs: { actor: responder } }))
    for (let g = 0; g < 3; g++) {
      const seg = { ...ids, segment: `s_${turn}_${g}` }
      const segDur = 1.5 + r() * 2
      out.push(rec('window:main', 'span.begin', pt, `participants/${responder}/tts`, { spanId: `tts_${turn}_${g}`, name: 'tts.request', ids: seg, attrs: { 'tts.content.text': 'a sentence of the reply that the agent speaks' } }))
      out.push(rec('window:main', 'instant', pt + 0.25, `participants/${responder}/tts`, { name: 'tts.first_byte', spanId: `tts_${turn}_${g}`, ids: seg }))
      out.push(rec('window:main', 'instant', pt + 0.3, `participants/${responder}/tts`, { name: 'tts.first_audible', spanId: `tts_${turn}_${g}`, ids: seg }))
      out.push(rec('window:main', 'span.end', pt + 0.9, `participants/${responder}/tts`, { spanId: `tts_${turn}_${g}`, status: 'ok', ids: seg, attrs: { 'tts.audio_duration_ms': segDur * 1000, 'tts.ttfb_ms': 250 } }))
      out.push(rec('window:main', 'span.begin', pt + 0.3, `participants/${responder}/playback`, { spanId: `pb_${turn}_${g}`, name: 'playback', ids: seg }))
      out.push(rec('window:main', 'span.end', pt + 0.3 + segDur, `participants/${responder}/playback`, { spanId: `pb_${turn}_${g}`, status: 'ok', ids: seg }))
      pt += segDur
    }
    out.push(rec('window:main', 'instant', pt, 'conversations/c_1/floor', { name: 'floor.released', ids, attrs: { actor: responder } }))
    for (const a of [speaker, responder])
      out.push(rec('window:main', 'state', pt, `participants/${a}/state`, { value: 'listening', from: 'speaking', ids }))
    // avatar
    out.push(rec('window:main', 'instant', ct + 1, 'avatar/emotion', { name: 'emotion.queued', ids, attrs: { emotion: 'happy' } }))
    out.push(rec('window:main', 'instant', ct + 1.2, 'avatar/motion', { name: 'motion.played', ids, attrs: { motion: 'nod' } }))
    t = pt + turnEveryS * (0.5 + r())
  }
  // background periodic records
  for (const s of Object.keys(sources)) {
    for (let c = 0; c < SESSION_S; c += 15)
      out.push(rec(s, 'clock.snapshot', c, 'runtime/clock', { values: [{ clock: `mono:${s}`, value: c * 1000 }, { clock: 'mono:collector', value: c * 1000 + 3 }], uncertaintyMs: 0.4 }))
  }
  for (const a of actors) {
    for (let c = 0; c < SESSION_S; c += 2)
      out.push(rec('window:main', 'clock.snapshot', c, `streams/${a}`, { values: [{ clock: `audio:${a}`, value: c * 48000 }, { clock: 'mono:window:main', value: c * 1000 }], uncertaintyMs: 1 }))
  }
  // VAD series per participant
  if (seriesOn) {
    for (const a of actors) {
      if (chunked) {
        for (let c = 0; c < SESSION_S; c += 1)
          out.push(rec('worker:vad', 'sample.chunk', c, `participants/${a}/vad`, { intervalMs: 50, values: { p: Array.from({ length: 20 }, () => Math.round(r() * 1000) / 1000) } }))
      }
      else {
        for (let c = 0; c < SESSION_S; c += 0.05)
          out.push(rec('worker:vad', 'sample', c, `participants/${a}/vad`, { values: { p: Math.round(r() * 1000) / 1000 } }))
      }
    }
  }
  out.sort((x, y) => x.ts - y.ts)
  for (const x of out) x.bytes = JSON.stringify(x).length
  return { records: out, turns: turn }
}

const isSeries = x => x.type === 'sample' || x.type === 'sample.chunk'

/** Policy A: one FIFO buffer, count limit and age limit (ADR today). */
function policySingle(records, { maxCount = 5000, maxAgeS = 1800 } = {}) {
  const now = SESSION_S * 1000
  let kept = records.filter(x => now - x.ts <= maxAgeS * 1000)
  if (kept.length > maxCount)
    kept = kept.slice(kept.length - maxCount)
  return kept
}

/** Policy C: events in a count+age buffer, series in per-track rings by age, older series decimated. */
function policySplit(records, { maxCount = 5000, maxAgeS = 1800, fullRateS = 300 } = {}) {
  const now = SESSION_S * 1000
  const events = policySingle(records.filter(x => !isSeries(x)), { maxCount, maxAgeS })
  const series = records.filter(x => isSeries(x) && now - x.ts <= maxAgeS * 1000)
  // decimate: older than fullRateS keep min/max per 1 s chunk -> represent as 2 numbers instead of 20
  const seriesBytes = series.reduce((sum, x) => {
    const old = now - x.ts > fullRateS * 1000
    if (!old)
      return sum + x.bytes
    return sum + Math.round(x.bytes * 0.25)
  }, 0)
  return { events, series, seriesBytes }
}

function report(name, opts) {
  const { records, turns } = generate(opts)
  const total = records.length
  const bytes = records.reduce((s, x) => s + x.bytes, 0)
  const seriesCount = records.filter(isSeries).length
  const lines = []
  lines.push(`\n## ${name}`)
  lines.push(`records generated in 30 min: ${total} (${(total / SESSION_S).toFixed(1)}/s), series records: ${seriesCount}, turns: ${turns}, JSON size: ${(bytes / 1e6).toFixed(2)} MB`)

  const evalKept = (kept, label) => {
    const oldest = kept.length ? kept[0].ts / 1000 : SESSION_S
    const turnIds = new Map()
    for (const x of records) {
      const t = x.ids?.turn
      if (!t || isSeries(x))
        continue
      turnIds.set(t, (turnIds.get(t) ?? 0) + 1)
    }
    const keptByTurn = new Map()
    for (const x of kept) {
      const t = x.ids?.turn
      if (!t || isSeries(x))
        continue
      keptByTurn.set(t, (keptByTurn.get(t) ?? 0) + 1)
    }
    let complete = 0
    for (const [t, n] of turnIds) {
      if (keptByTurn.get(t) === n)
        complete++
    }
    const evKept = kept.filter(x => !isSeries(x))
    const evOldest = evKept.length ? evKept[0].ts / 1000 : SESSION_S
    const keptBytes = kept.reduce((s, x) => s + x.bytes, 0)
    lines.push(`- ${label}: kept ${kept.length} records (${(keptBytes / 1e6).toFixed(2)} MB). Window covered: last ${((SESSION_S - oldest) / 60).toFixed(1)} min. Events window: last ${((SESSION_S - evOldest) / 60).toFixed(1)} min. Complete turns: ${complete}/${turns}.`)
  }
  evalKept(policySingle(records), 'A single FIFO, 5000 records / 30 min')
  evalKept(policySingle(records, { maxCount: Infinity }), 'B single FIFO, no count limit (age only)')
  const split = policySplit(records)
  const evBytes = split.events.reduce((s, x) => s + x.bytes, 0)
  const evOldest = split.events.length ? split.events[0].ts / 1000 : SESSION_S
  const turnTotal = turns
  const complete = new Set(split.events.map(x => x.ids?.turn).filter(Boolean))
  lines.push(`- C split: events ${split.events.length} records (${(evBytes / 1e6).toFixed(2)} MB, window ${((SESSION_S - evOldest) / 60).toFixed(1)} min, turns with records ${complete.size}/${turnTotal}); series ${split.series.length} records in rings (${(split.seriesBytes / 1e6).toFixed(2)} MB after decimation, window 30.0 min)`)
  process.stdout.write(`${lines.join('\n')}\n`)
}

for (const participants of [2, 3]) {
  report(`${participants} participants, viewer closed (no series)`, { participants, turnEveryS: 15, seriesOn: false, chunked: false })
  report(`${participants} participants, viewer open, one record per point`, { participants, turnEveryS: 15, seriesOn: true, chunked: false })
  report(`${participants} participants, viewer open, 1 s chunks`, { participants, turnEveryS: 15, seriesOn: true, chunked: true })
}
report('3 participants, busy (turn every 5 s), viewer closed', { participants: 3, turnEveryS: 5, seriesOn: false, chunked: false })
