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
    {
      id: 'ark-code-latest',
      descriptionKey: 'settings.pages.providers.provider.volcengine-coding-plan.models.ark-code-latest.description',
    },
    { id: 'doubao-seed-2.1-turbo', contextLength: 256000 },
    { id: 'doubao-seed-2.0-lite', contextLength: 256000 },
    { id: 'minimax-m3', contextLength: 1024000 },
    { id: 'kimi-k2.7-code', contextLength: 256000 },
    { id: 'glm-5.3', contextLength: 1024000 },
    { id: 'deepseek-v4-flash', contextLength: 1024000 },
    { id: 'deepseek-v4-pro', contextLength: 1024000 },
    {
      id: 'doubao-seed-2.0-code',
      contextLength: 256000,
      deprecated: true,
      descriptionKey: 'settings.pages.providers.provider.volcengine-coding-plan.models.legacy.description',
    },
    {
      id: 'doubao-seed-2.0-pro',
      contextLength: 256000,
      deprecated: true,
      descriptionKey: 'settings.pages.providers.provider.volcengine-coding-plan.models.legacy.description',
    },
  ],
})
