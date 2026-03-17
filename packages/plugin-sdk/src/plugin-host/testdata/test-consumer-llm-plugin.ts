import type { ContextInit } from '../../plugin/shared'

export async function setupModules({ apis }: ContextInit): Promise<void> {
  await apis.resources.createClaim({
    id: 'claim-consumer-openai',
    kind: 'ai.provider',
    selector: {
      vendor: 'openai',
    },
    constraints: {
      task: 'text-generation',
    },
    owner: {
      pluginId: 'test-consumer-llm',
      moduleId: 'consumer-module',
    },
  })
}
