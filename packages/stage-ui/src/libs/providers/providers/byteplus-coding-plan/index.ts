import { createArkChatProviderDefinition } from '../ark-shared'

export const providerBytePlusCodingPlan = createArkChatProviderDefinition({
  id: 'byteplus-coding-plan',
  order: 9,
  name: 'BytePlus Coding Plan',
  nameKey: 'settings.pages.providers.provider.byteplus-coding-plan.title',
  description: 'BytePlus Coding Plan',
  descriptionKey: 'settings.pages.providers.provider.byteplus-coding-plan.description',
  modelPrefix: 'byteplus-coding-plan/',
  defaultBaseUrl: 'https://ark.ap-southeast.bytepluses.com/api/coding/v3',
  icon: 'i-lobe-icons:bytedance',
  iconColor: 'i-lobe-icons:bytedance-color',
  models: [
    { id: 'dola-seed-2.0-pro' },
    { id: 'dola-seed-2.0-lite' },
    { id: 'bytedance-seed-code' },
    { id: 'glm-4.7' },
    { id: 'kimi-k2.5' },
    { id: 'gpt-oss-120b' },
  ],
})
