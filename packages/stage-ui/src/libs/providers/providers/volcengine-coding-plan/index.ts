import { createArkChatProviderDefinition } from '../ark-shared'

export const providerVolcengineCodingPlan = createArkChatProviderDefinition({
  id: 'volcengine-coding-plan',
  order: 7,
  name: 'Volcengine Coding Plan',
  nameKey: 'settings.pages.providers.provider.volcengine-coding-plan.title',
  description: 'Volcengine Coding Plan',
  descriptionKey: 'settings.pages.providers.provider.volcengine-coding-plan.description',
  modelPrefix: 'volcengine-coding-plan/',
  defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
  icon: 'i-lobe-icons:volcengine',
  iconColor: 'i-lobe-icons:volcengine',
  models: [
    { id: 'doubao-seed-2.0-code', contextLength: 256000 },
    { id: 'doubao-seed-2.0-pro', contextLength: 256000 },
    { id: 'doubao-seed-2.0-lite', contextLength: 256000 },
    { id: 'doubao-seed-code', contextLength: 256000 },
    { id: 'minimax-m2.5', contextLength: 200000 },
    { id: 'glm-4.7', contextLength: 200000 },
    { id: 'deepseek-v3.2', contextLength: 128000 },
    { id: 'kimi-k2.5', contextLength: 256000 },
  ],
})
