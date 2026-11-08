import { createArkChatProviderDefinition } from '../ark-shared'

export const providerVolcengineAgentPlan = createArkChatProviderDefinition({
  id: 'volcengine-agent-plan',
  order: 7,
  name: 'Volcengine Agent Plan',
  nameKey: 'settings.pages.providers.provider.volcengine-agent-plan.title',
  description: 'Volcengine Agent Plan',
  descriptionKey: 'settings.pages.providers.provider.volcengine-agent-plan.description',
  modelPrefix: 'volcengine-agent-plan/',
  defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
  icon: 'i-lobe-icons:volcengine',
  iconColor: 'i-lobe-icons:volcengine',
  models: [
    { id: 'doubao-seed-2.0-mini', contextLength: 256000 },
    { id: 'doubao-seed-2.1-lite', contextLength: 1024000 },
    { id: 'deepseek-v4-flash', contextLength: 1024000 },
    { id: 'glm-5.3-flash', contextLength: 1024000 },
    { id: 'doubao-seed-2.1-pro', contextLength: 1024000 },
    { id: 'doubao-seed-evolving', contextLength: 1024000 },
    { id: 'glm-5.3', contextLength: 1024000 },
    { id: 'kimi-k2.8-preview', contextLength: 1024000 },
    { id: 'deepseek-v4-pro', contextLength: 1024000 },
    { id: 'kimi-k3', contextLength: 1024000 },
    { id: 'kimi-k3.1-pro', contextLength: 1024000 },
    { id: 'deepseek-v4.1-flash', contextLength: 1024000 },
    { id: 'deepseek-v4.1-flash-economy', contextLength: 1024000 },
  ],
})
