export interface InferenceMetrics {
  totalInferences: number
  successCount: number
  failureCount: number
  avgPrefillLatencyMs: number
  avgDecodeLatencyMs: number
  avgTotalLatencyMs: number
  lastLatencyMs: number
}

export interface MediaMetrics {
  audioChunksReceived: number
  videoFramesReceived: number
  audioChunksDropped: number
  videoFramesDropped: number
  currentBufferDepthAudio: number
  currentBufferDepthVideo: number
}

export interface SessionMetrics {
  activeSessionCount: number
  totalSessionsCreated: number
  avgSessionDurationMs: number
}

export function createInferenceMetrics(): InferenceMetrics {
  return {
    totalInferences: 0,
    successCount: 0,
    failureCount: 0,
    avgPrefillLatencyMs: 0,
    avgDecodeLatencyMs: 0,
    avgTotalLatencyMs: 0,
    lastLatencyMs: 0,
  }
}

export function createMediaMetrics(): MediaMetrics {
  return {
    audioChunksReceived: 0,
    videoFramesReceived: 0,
    audioChunksDropped: 0,
    videoFramesDropped: 0,
    currentBufferDepthAudio: 0,
    currentBufferDepthVideo: 0,
  }
}

export function createSessionMetrics(): SessionMetrics {
  return {
    activeSessionCount: 0,
    totalSessionsCreated: 0,
    avgSessionDurationMs: 0,
  }
}

export function recordLatency(
  metrics: InferenceMetrics,
  latencyMs: number,
  success: boolean,
  phase?: 'prefill' | 'decode',
): void {
  metrics.totalInferences++
  metrics.lastLatencyMs = latencyMs

  if (success) {
    metrics.successCount++
    const n = metrics.successCount
    metrics.avgTotalLatencyMs += (latencyMs - metrics.avgTotalLatencyMs) / n

    if (phase === 'prefill') {
      metrics.avgPrefillLatencyMs += (latencyMs - metrics.avgPrefillLatencyMs) / n
    }
    else if (phase === 'decode') {
      metrics.avgDecodeLatencyMs += (latencyMs - metrics.avgDecodeLatencyMs) / n
    }
  }
  else {
    metrics.failureCount++
  }
}
