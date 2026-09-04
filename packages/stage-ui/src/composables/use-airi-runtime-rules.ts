import type { AiriRuntimeRuleSet } from '../constants/prompts/emotion-rules'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { createEmotionRuleSet, formatAiriRuntimeRuleSet } from '../constants/prompts/emotion-rules'

const SPLIT_PROMPT_KEYS = [
  'base.prompt.character',
  'base.prompt.emotion',
  'base.prompt.emoji',
  'base.prompt.suffix',
]

/**
 * Resolves AIRI's static character prompt and dynamic response rules.
 *
 * Locales that Crowdin has not split yet retain their translated legacy card
 * prompt. They do not receive the English runtime rule fallback a second time.
 */
export function useAiriRuntimeRules() {
  const { locale, t, te } = useI18n()
  const hasSplitPrompt = computed(() => SPLIT_PROMPT_KEYS.every(key => te(key, locale.value)))

  const defaultCharacterPrompt = computed(() => {
    if (hasSplitPrompt.value)
      return t('base.prompt.character')

    return t('base.prompt.prefix')
  })

  const runtimeRuleSet = computed<AiriRuntimeRuleSet | undefined>(() => {
    if (!hasSplitPrompt.value)
      return undefined

    return {
      emotion: createEmotionRuleSet(
        t('base.prompt.emotion'),
        t('base.prompt.suffix'),
      ),
      emoji: t('base.prompt.emoji'),
    }
  })

  const runtimeRulesText = computed(() => runtimeRuleSet.value ? formatAiriRuntimeRuleSet(runtimeRuleSet.value) : '')

  return {
    defaultCharacterPrompt,
    runtimeRuleSet,
    runtimeRulesText,
  }
}
