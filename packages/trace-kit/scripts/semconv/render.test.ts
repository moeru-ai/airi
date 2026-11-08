import { describe, expect, it } from 'vitest'

import { constantName, renderModule } from './render'

const source = { commit: 'abc123', files: ['model/gen-ai/registry.yaml'] }

describe('renderModule', () => {
  it('renders attributes, enum members, and metrics as constants', () => {
    const output = renderModule(source, [
      {
        attributes: [{
          key: 'gen_ai.token.modality',
          brief: 'The modality of the tokens being counted.',
          stability: 'development',
          type: { members: [{ id: 'unknown', value: 'unknown', brief: 'The modality is not known.' }] },
        }],
      },
      {
        metrics: [{ name: 'gen_ai.client.inference.usage.cache_read.input_tokens', instrument: 'counter', unit: '{token}', brief: 'Input tokens served from a cache.' }],
      },
    ])

    expect(output).toContain(`export const SEMCONV_GENAI_COMMIT = 'abc123'`)
    expect(output).toContain(`export const ATTR_GEN_AI_TOKEN_MODALITY = 'gen_ai.token.modality'`)
    expect(output).toContain(`export const GEN_AI_TOKEN_MODALITY_VALUE_UNKNOWN = 'unknown'`)
    expect(output).toContain(`export const METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_READ_INPUT_TOKENS = 'gen_ai.client.inference.usage.cache_read.input_tokens'`)
    expect(output).toContain(' * Instrument: `counter`. Unit: `{token}`.')
  })

  it('rejects two names that map to the same constant', () => {
    expect(() => renderModule(source, [{ attributes: [{ key: 'a.b', type: 'string' }, { key: 'a_b', type: 'string' }] }])).toThrow('Duplicate constant ATTR_A_B')
  })

  it('escapes comment terminators in briefs', () => {
    const output = renderModule(source, [{ attributes: [{ key: 'x.y', brief: 'ends */ early', type: 'string' }] }])
    expect(output).toContain(' * ends *\\/ early')
  })
})

describe('constantName', () => {
  it('maps dots and dashes to underscores', () => {
    expect(constantName('gen_ai.provider.name')).toBe('GEN_AI_PROVIDER_NAME')
    expect(constantName('azure.ai-inference')).toBe('AZURE_AI_INFERENCE')
  })
})
