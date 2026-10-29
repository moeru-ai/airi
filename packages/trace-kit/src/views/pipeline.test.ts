import { describe, expect, it } from 'vitest'

import { agentProfile } from '../profiles/agent'
import { voiceProfile } from '../profiles/voice'
import { readTimeline } from '../testing'
import { pipelineNodes } from './pipeline'

describe('pipeline view', () => {
  it('derives pipeline stage status from open and failed spans', () => {
    const { state } = readTimeline([
      { type: 'span.begin', ts: 0, track: 'participants/user/asr', spanId: 'a', name: 'asr' },
      { type: 'span.begin', ts: 0, track: 'agents/agent/llm', spanId: 'l', name: 'chat' },
      { type: 'span.end', ts: 10, track: 'agents/agent/llm', spanId: 'l', status: 'error' },
    ], { profiles: [voiceProfile, agentProfile] })
    const pipeline = voiceProfile.pipelines!.find(candidate => candidate.key === 'voice.turn')!

    const nodes = pipelineNodes(state, pipeline, 20, 'en')

    expect(nodes.find(node => node.stage === 'asr')?.status).toBe('busy')
    expect(nodes.find(node => node.stage === 'agent')?.status).toBe('error')
    expect(nodes.find(node => node.stage === 'playback')?.status).toBe('idle')
    // A stage without a track in the trace is idle too, but the view must tell it apart from a stage with no work.
    expect(nodes.find(node => node.stage === 'asr')?.observed).toBe(true)
    expect(nodes.find(node => node.stage === 'playback')?.observed).toBe(false)
  })
})
