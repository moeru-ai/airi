import { createArkChatProviderDefinition } from '../ark-shared'

export const providerVolcengineCodingPlan = createArkChatProviderDefinition({
  defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
  description: 'Volcengine Coding Plan',
  descriptionKey: 'settings.pages.providers.provider.volcengine-coding-plan.description',
  icon: 'i-lobe-icons:volcengine',
  iconColor: 'i-lobe-icons:volcengine',
  id: 'volcengine-coding-plan',
  modelPrefix: 'volcengine-coding-plan/',
  models: [
    {
      descriptionKey: 'settings.pages.providers.provider.volcengine-coding-plan.models.ark-code-latest.description',
      id: 'ark-code-latest',
    },
    { contextLength: 256000, id: 'doubao-seed-2.1-turbo' },
    { contextLength: 256000, id: 'doubao-seed-2.0-lite' },
    { contextLength: 1024000, id: 'minimax-m3' },
    { contextLength: 256000, id: 'kimi-k2.7-code' },
    { contextLength: 1024000, id: 'glm-5.3' },
    { contextLength: 1024000, id: 'deepseek-v4-flash' },
    { contextLength: 1024000, id: 'deepseek-v4-pro' },
    {
      contextLength: 256000,
      deprecated: true,
      descriptionKey: 'settings.pages.providers.provider.volcengine-coding-plan.models.legacy.description',
      id: 'doubao-seed-2.0-code',
    },
    {
      contextLength: 256000,
      deprecated: true,
      descriptionKey: 'settings.pages.providers.provider.volcengine-coding-plan.models.legacy.description',
      id: 'doubao-seed-2.0-pro',
    },
  ],
  name: 'Volcengine Coding Plan',
  nameKey: 'settings.pages.providers.provider.volcengine-coding-plan.title',
  order: 7,
})
