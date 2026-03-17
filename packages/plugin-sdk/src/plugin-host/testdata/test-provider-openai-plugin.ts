import type { ContextInit } from '../../plugin/shared'

export async function setupModules({ apis }: ContextInit): Promise<void> {
  await apis.resources.register({
    id: 'provider-openai-resource',
    kind: 'ai.provider',
    labels: {
      vendor: 'openai',
      category: 'llm',
    },
    metadata: {
      name: 'openai',
      features: ['generateText', 'streamText'],
    },
    phase: 'Ready',
    owner: {
      pluginId: 'test-provider-openai',
      moduleId: 'provider-module',
    },
  })
}
