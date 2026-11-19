import { createVoiceTranscriptionRephraseAgent, generateTextFrom } from '@proj-airi/agents'
import { parse, picklist } from 'valibot'
import { describeTask, expect } from 'vieval'
import { modelFromRun, openrouterFromRunContext } from 'vieval/plugins/chat-models'

import { asrRewriteCases } from '../src/cases'
import { generationProviderFrom } from '../src/provider'

describeTask('voice-transcription-rephrase', ({ casesFromInputs }) => {
  casesFromInputs('case', asrRewriteCases, async (context) => {
    const input = context.matrix.inputs
    const config = openrouterFromRunContext(modelFromRun(context, { axis: 'model' }))
    // The product sends `disabled` for this task. See `useVoiceRephrase` in stage-ui.
    const reasoning = parse(picklist(['enabled', 'disabled']), context.task.matrix.run.thinking)

    const agent = createVoiceTranscriptionRephraseAgent({
      generateText: generateTextFrom(config.model, await generationProviderFrom(config, reasoning)),
    })

    const startedAt = performance.now()
    const rewritten = await agent.rephrase(input.segments, context.signal)
    context.recordMetric('latency_ms', Math.round(performance.now() - startedAt))

    await context.recordArtifact('rephrase.json', {
      body: `${JSON.stringify({ name: input.name, model: config.model, reasoning, segments: input.segments, rewritten }, null, 2)}\n`,
      contentType: 'application/json',
      purpose: 'asr_rewrite.output',
    })

    context.recordMetric('changed_segments', rewritten.filter((text, index) => text.trim() !== input.segments[index]?.trim()).length)

    // The plugin drops a reply with another segment count, so that reply is a failure here.
    expect(rewritten).toHaveLength(input.segments.length)
  })
})
