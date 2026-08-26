import { createArkChatProviderDefinition } from '../ark-shared'

export const providerBytePlusCodingPlan = createArkChatProviderDefinition({
  defaultBaseUrl: 'https://ark.ap-southeast.bytepluses.com/api/coding/v3',
  description: 'BytePlus Coding Plan',
  descriptionKey: 'settings.pages.providers.provider.byteplus-coding-plan.description',
  icon: 'i-lobe-icons:bytedance',
  iconColor: 'i-lobe-icons:bytedance-color',
  id: 'byteplus-coding-plan',
  modelPrefix: 'byteplus-coding-plan/',
  models: [
    { id: 'dola-seed-2.0-pro' },
    { id: 'dola-seed-2.0-lite' },
    { id: 'bytedance-seed-code' },
    { id: 'glm-4.7' },
    { id: 'kimi-k2.5' },
    { id: 'gpt-oss-120b' },
  ],
  name: 'BytePlus Coding Plan',
  nameKey: 'settings.pages.providers.provider.byteplus-coding-plan.title',
  order: 9,
})
